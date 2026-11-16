package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/The-Conos-Project/hackploy-platform/internal/auth"
	"github.com/The-Conos-Project/hackploy-platform/internal/store"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func (s *Server) listGroups(w http.ResponseWriter, r *http.Request) {
	sess := sessionFrom(r)
	list, err := s.store.ListClasses()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "store error")
		return
	}
	if list == nil {
		list = []store.Class{}
	}
	if sess.Role != auth.RoleAdmin {
		mine := make([]store.Class, 0)
		for _, c := range list {
			for _, mid := range c.MemberIDs {
				if mid == sess.Subject {
					mine = append(mine, c)
					break
				}
			}
		}
		list = mine
	}
	writeJSON(w, http.StatusOK, map[string]any{"groups": list})
}

func (s *Server) createGroup(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Name) == "" {
		writeErr(w, http.StatusBadRequest, "name required")
		return
	}
	c := &store.Class{
		ID:       uuid.NewString()[:8],
		Name:     strings.TrimSpace(body.Name),
		JoinCode: fmt.Sprintf("GRP-%s", strings.ToUpper(uuid.NewString()[:6])),
	}
	if err := s.store.CreateClass(c); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not create group")
		return
	}
	writeJSON(w, http.StatusCreated, c)
}

func (s *Server) getGroup(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	c, err := s.store.GetClass(id)
	if err != nil || c == nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	sess := sessionFrom(r)
	if sess.Role != auth.RoleAdmin {
		ok := false
		for _, mid := range c.MemberIDs {
			if mid == sess.Subject {
				ok = true
				break
			}
		}
		if !ok {
			writeErr(w, http.StatusForbidden, "forbidden")
			return
		}
	}
	writeJSON(w, http.StatusOK, c)
}

func (s *Server) deleteGroup(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := s.store.DeleteClass(id); err != nil {
		writeErr(w, http.StatusInternalServerError, "delete failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"ok": "true"})
}

func (s *Server) joinGroup(w http.ResponseWriter, r *http.Request) {
	sess := sessionFrom(r)
	var body struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Code) == "" {
		writeErr(w, http.StatusBadRequest, "code required")
		return
	}
	c, err := s.store.GetClassByJoinCode(strings.TrimSpace(body.Code))
	if err != nil || c == nil {
		writeErr(w, http.StatusNotFound, "invalid join code")
		return
	}
	for _, mid := range c.MemberIDs {
		if mid == sess.Subject {
			writeJSON(w, http.StatusOK, c)
			return
		}
	}
	c.MemberIDs = append(c.MemberIDs, sess.Subject)
	if err := s.store.UpdateClass(c); err != nil {
		writeErr(w, http.StatusInternalServerError, "join failed")
		return
	}
	writeJSON(w, http.StatusOK, c)
}

func (s *Server) assignLabs(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	c, err := s.store.GetClass(id)
	if err != nil || c == nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	var body struct {
		ChallengeIDs []string `json:"challenge_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	if body.ChallengeIDs == nil {
		body.ChallengeIDs = []string{}
	}
	c.ChallengeIDs = body.ChallengeIDs
	if err := s.store.UpdateClass(c); err != nil {
		writeErr(w, http.StatusInternalServerError, "assign failed")
		return
	}
	writeJSON(w, http.StatusOK, c)
}

type flagSpec struct {
	Flag        string `json:"flag"`
	Points      int    `json:"points"`
	MaxAttempts int    `json:"max_attempts"`
}

func parseFlagSpecs(raw string) []flagSpec {
	var specs []flagSpec
	_ = json.Unmarshal([]byte(raw), &specs)
	out := make([]flagSpec, 0, len(specs))
	for _, s := range specs {
		if s.Flag == "" {
			continue
		}
		if s.Points <= 0 {
			s.Points = 100
		}
		if s.MaxAttempts <= 0 {
			s.MaxAttempts = 50
		}
		out = append(out, s)
	}
	return out
}

func (s *Server) submitFlag(w http.ResponseWriter, r *http.Request) {
	sess := sessionFrom(r)
	instanceID := chi.URLParam(r, "id")
	inst, err := s.store.GetInstance(instanceID)
	if err != nil || inst == nil {
		writeErr(w, http.StatusNotFound, "instance not found")
		return
	}
	if sess.Role != auth.RoleAdmin && inst.UserID != sess.Subject {
		writeErr(w, http.StatusForbidden, "forbidden")
		return
	}
	var body struct {
		Flag      string `json:"flag"`
		FlagIndex *int   `json:"flag_index"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Flag) == "" {
		writeErr(w, http.StatusBadRequest, "flag required")
		return
	}
	submitted := strings.TrimSpace(body.Flag)
	ch, err := s.store.GetChallenge(inst.ChallengeID)
	if err != nil || ch == nil {
		writeErr(w, http.StatusBadRequest, "challenge missing")
		return
	}
	specs := parseFlagSpecs(ch.Flags)
	if len(specs) == 0 {
		writeErr(w, http.StatusBadRequest, "no flags configured")
		return
	}

	var submittedFlags []string
	_ = json.Unmarshal([]byte(inst.SubmittedFlags), &submittedFlags)
	already := map[string]bool{}
	for _, f := range submittedFlags {
		already[f] = true
	}

	candidates := make([]int, 0, len(specs))
	if body.FlagIndex != nil {
		idx := *body.FlagIndex
		if idx < 0 || idx >= len(specs) {
			writeErr(w, http.StatusBadRequest, "invalid flag index")
			return
		}
		candidates = append(candidates, idx)
	} else {
		for i := range specs {
			candidates = append(candidates, i)
		}
	}

	var attempts map[string]int
	_ = json.Unmarshal([]byte(inst.AttemptCounts), &attempts)
	if attempts == nil {
		attempts = map[string]int{}
	}

	matchIdx := -1
	for _, idx := range candidates {
		if already[specs[idx].Flag] {
			continue
		}
		key := fmt.Sprintf("%d", idx)
		if attempts[key] >= specs[idx].MaxAttempts {
			continue
		}
		if submitted == specs[idx].Flag {
			matchIdx = idx
			break
		}
	}

	if matchIdx < 0 {
		// bump attempt on first eligible index (or explicit index)
		bump := candidates[0]
		for _, idx := range candidates {
			if !already[specs[idx].Flag] {
				bump = idx
				break
			}
		}
		if already[specs[bump].Flag] {
			writeErr(w, http.StatusConflict, "already submitted")
			return
		}
		key := fmt.Sprintf("%d", bump)
		if attempts[key] >= specs[bump].MaxAttempts {
			writeErr(w, http.StatusTooManyRequests, "no attempts remaining")
			return
		}
		attempts[key]++
		b, _ := json.Marshal(attempts)
		inst.AttemptCounts = string(b)
		_ = s.store.UpdateInstance(inst)
		writeErr(w, http.StatusBadRequest, "incorrect")
		return
	}

	submittedFlags = append(submittedFlags, specs[matchIdx].Flag)
	b, _ := json.Marshal(submittedFlags)
	inst.SubmittedFlags = string(b)
	if err := s.store.UpdateInstance(inst); err != nil {
		writeErr(w, http.StatusInternalServerError, "save failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":        true,
		"accepted":  specs[matchIdx].Flag,
		"completed": len(submittedFlags),
		"total":     len(specs),
		"points":    specs[matchIdx].Points,
	})
}

type leaderboardRow struct {
	UserID   string `json:"user_id"`
	Username string `json:"username"`
	Points   int    `json:"points"`
	Solved   int    `json:"solved"`
}

func (s *Server) leaderboard(w http.ResponseWriter, r *http.Request) {
	sess := sessionFrom(r)
	classID := r.URL.Query().Get("group_id")
	classes, err := s.store.ListClasses()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "store error")
		return
	}
	users, err := s.store.ListUsers()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "store error")
		return
	}
	userMap := map[string]store.User{}
	for _, u := range users {
		userMap[u.ID] = u
	}

	type groupBoard struct {
		GroupID   string           `json:"group_id"`
		GroupName string           `json:"group_name"`
		Rows      []leaderboardRow `json:"rows"`
	}
	out := make([]groupBoard, 0)

	for _, c := range classes {
		if classID != "" && c.ID != classID {
			continue
		}
		if sess.Role != auth.RoleAdmin {
			member := false
			for _, mid := range c.MemberIDs {
				if mid == sess.Subject {
					member = true
					break
				}
			}
			if !member {
				continue
			}
		}
		assigned := map[string]bool{}
		for _, id := range c.ChallengeIDs {
			assigned[id] = true
		}
		scores := map[string]*leaderboardRow{}
		for _, mid := range c.MemberIDs {
			u := userMap[mid]
			if u.ID == "" {
				continue
			}
			scores[mid] = &leaderboardRow{UserID: mid, Username: u.Username}
		}
		// score from all instances of members
		for _, mid := range c.MemberIDs {
			insts, _ := s.store.ListInstancesByUser(mid)
			solvedByChallenge := map[string]map[string]bool{}
			for _, inst := range insts {
				if !assigned[inst.ChallengeID] {
					continue
				}
				var flags []string
				_ = json.Unmarshal([]byte(inst.SubmittedFlags), &flags)
				set := solvedByChallenge[inst.ChallengeID]
				if set == nil {
					set = map[string]bool{}
				}
				for _, f := range flags {
					set[f] = true
				}
				solvedByChallenge[inst.ChallengeID] = set
			}
			row := scores[mid]
			if row == nil {
				continue
			}
			for cid := range assigned {
				ch, _ := s.store.GetChallenge(cid)
				if ch == nil {
					continue
				}
				specs := parseFlagSpecs(ch.Flags)
				got := solvedByChallenge[cid]
				awarded := 0
				for _, spec := range specs {
					if got[spec.Flag] {
						row.Points += spec.Points
						awarded++
					}
				}
				if len(specs) > 0 && awarded == len(specs) {
					row.Solved++
				}
			}
		}
		rows := make([]leaderboardRow, 0, len(scores))
		for _, row := range scores {
			if row.Points > 0 {
				rows = append(rows, *row)
			}
		}
		// sort
		for i := 0; i < len(rows); i++ {
			for j := i + 1; j < len(rows); j++ {
				if rows[j].Points > rows[i].Points ||
					(rows[j].Points == rows[i].Points && rows[j].Solved > rows[i].Solved) ||
					(rows[j].Points == rows[i].Points && rows[j].Solved == rows[i].Solved && rows[j].Username < rows[i].Username) {
					rows[i], rows[j] = rows[j], rows[i]
				}
			}
		}
		out = append(out, groupBoard{GroupID: c.ID, GroupName: c.Name, Rows: rows})
	}
	writeJSON(w, http.StatusOK, map[string]any{"boards": out})
}
