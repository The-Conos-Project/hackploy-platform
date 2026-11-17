package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

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

func (s *Server) requireGroupMember(w http.ResponseWriter, r *http.Request, c *store.Class) bool {
	sess := sessionFrom(r)
	if sess.Role == auth.RoleAdmin {
		return true
	}
	for _, mid := range c.MemberIDs {
		if mid == sess.Subject {
			return true
		}
	}
	writeErr(w, http.StatusForbidden, "forbidden")
	return false
}

// groupFirstBloods returns the earliest solver username per assigned challenge.
func (s *Server) groupFirstBloods(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	c, err := s.store.GetClass(id)
	if err != nil || c == nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	if !s.requireGroupMember(w, r, c) {
		return
	}
	stats := s.computeGroupChallengeStats(c, "")
	writeJSON(w, http.StatusOK, map[string]any{"bloods": stats.Bloods})
}

// groupSetStats returns solves, solvers, bloods, and a set-scoped scoreboard.
func (s *Server) groupSetStats(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	c, err := s.store.GetClass(id)
	if err != nil || c == nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	if !s.requireGroupMember(w, r, c) {
		return
	}
	setKey := strings.TrimSpace(r.URL.Query().Get("set"))
	stats := s.computeGroupChallengeStats(c, setKey)
	writeJSON(w, http.StatusOK, stats)
}

func (s *Server) groupMembers(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	c, err := s.store.GetClass(id)
	if err != nil || c == nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	if !s.requireGroupMember(w, r, c) {
		return
	}
	members := make([]map[string]any, 0, len(c.MemberIDs))
	for _, mid := range c.MemberIDs {
		u, err := s.store.GetUserByID(mid)
		if err != nil || u == nil {
			continue
		}
		members = append(members, map[string]any{
			"id":       u.ID,
			"username": u.Username,
			"handle":   u.Handle,
			"path":     u.ProfilePath(),
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"members": members,
		"count":   len(members),
	})
}

type solverRow struct {
	Username string    `json:"username"`
	At       time.Time `json:"at"`
}

type setBoardRow struct {
	UserID      string `json:"user_id"`
	Username    string `json:"username"`
	Points      int    `json:"points"`
	Solved      int    `json:"solved"`
	FirstBloods int    `json:"first_bloods"`
}

type groupChallengeStats struct {
	Set     string                  `json:"set,omitempty"`
	Bloods  map[string]string       `json:"bloods"`
	Solves  map[string]int          `json:"solves"`
	Solvers map[string][]solverRow  `json:"solvers"`
	Board   []setBoardRow           `json:"board"`
}

func (s *Server) computeGroupChallengeStats(c *store.Class, setKey string) groupChallengeStats {
	out := groupChallengeStats{
		Set:     setKey,
		Bloods:  map[string]string{},
		Solves:  map[string]int{},
		Solvers: map[string][]solverRow{},
		Board:   []setBoardRow{},
	}
	assigned := map[string]bool{}
	for _, cid := range c.ChallengeIDs {
		assigned[cid] = true
	}
	allCh, err := s.store.ListChallenges()
	if err != nil {
		return out
	}
	chByID := map[string]*store.Challenge{}
	setChallenges := map[string]bool{}
	flagToChallenges := map[string][]string{}
	for i := range allCh {
		ch := &allCh[i]
		if !assigned[ch.ID] {
			continue
		}
		chByID[ch.ID] = ch
		tag := strings.TrimPrefix(ch.ImageTag, "hackploy-")
		if setKey != "" && tag != setKey && ch.ImageTag != setKey {
			continue
		}
		setChallenges[ch.ID] = true
		for _, spec := range parseFlagSpecs(ch.Flags) {
			flagToChallenges[spec.Flag] = append(flagToChallenges[spec.Flag], ch.ID)
		}
	}
	if len(setChallenges) == 0 {
		return out
	}

	type blood struct {
		userID string
		at     time.Time
	}
	first := map[string]blood{}
	solvedUsers := map[string]map[string]time.Time{}

	memberFlags := map[string]map[string]bool{}
	for _, mid := range c.MemberIDs {
		insts, _ := s.store.ListInstancesByUser(mid)
		gotFlags := map[string]bool{}
		earliest := time.Time{}
		for _, inst := range insts {
			var flags []string
			_ = json.Unmarshal([]byte(inst.SubmittedFlags), &flags)
			for _, f := range flags {
				gotFlags[f] = true
				for _, chID := range flagToChallenges[f] {
					prev, ok := first[chID]
					if !ok || inst.CreatedAt.Before(prev.at) {
						first[chID] = blood{userID: mid, at: inst.CreatedAt}
					}
				}
			}
			if !earliest.IsZero() && !inst.CreatedAt.Before(earliest) {
				continue
			}
			if len(flags) > 0 {
				earliest = inst.CreatedAt
			}
		}
		memberFlags[mid] = gotFlags
		for chID := range setChallenges {
			ch := chByID[chID]
			if ch == nil {
				continue
			}
			specs := parseFlagSpecs(ch.Flags)
			if len(specs) == 0 {
				continue
			}
			complete := true
			for _, spec := range specs {
				if !gotFlags[spec.Flag] {
					complete = false
					break
				}
			}
			if !complete {
				continue
			}
			if solvedUsers[chID] == nil {
				solvedUsers[chID] = map[string]time.Time{}
			}
			at := earliest
			if at.IsZero() {
				at = time.Now().UTC()
			}
			solvedUsers[chID][mid] = at
		}
	}

	users, _ := s.store.ListUsers()
	userMap := map[string]store.User{}
	for _, u := range users {
		userMap[u.ID] = u
	}

	bloodCount := map[string]int{}
	for chID, b := range first {
		if !setChallenges[chID] {
			continue
		}
		if u, ok := userMap[b.userID]; ok {
			out.Bloods[chID] = u.Username
			bloodCount[b.userID]++
		}
	}
	for chID, usersMap := range solvedUsers {
		out.Solves[chID] = len(usersMap)
		list := make([]solverRow, 0, len(usersMap))
		for uid, at := range usersMap {
			u := userMap[uid]
			if u.ID == "" {
				continue
			}
			list = append(list, solverRow{Username: u.Username, At: at})
		}
		for i := 0; i < len(list); i++ {
			for j := i + 1; j < len(list); j++ {
				if list[j].At.Before(list[i].At) {
					list[i], list[j] = list[j], list[i]
				}
			}
		}
		out.Solvers[chID] = list
	}

	rows := make([]setBoardRow, 0, len(c.MemberIDs))
	for _, mid := range c.MemberIDs {
		u := userMap[mid]
		if u.ID == "" {
			continue
		}
		row := setBoardRow{UserID: mid, Username: u.Username, FirstBloods: bloodCount[mid]}
		gotFlags := memberFlags[mid]
		if gotFlags == nil {
			gotFlags = map[string]bool{}
		}
		for chID := range setChallenges {
			ch := chByID[chID]
			if ch == nil {
				continue
			}
			specs := parseFlagSpecs(ch.Flags)
			awarded := 0
			for _, spec := range specs {
				if gotFlags[spec.Flag] {
					row.Points += spec.Points
					awarded++
				}
			}
			if len(specs) > 0 && awarded == len(specs) {
				row.Solved++
			}
		}
		rows = append(rows, row)
	}
	for i := 0; i < len(rows); i++ {
		for j := i + 1; j < len(rows); j++ {
			if rows[j].Points > rows[i].Points ||
				(rows[j].Points == rows[i].Points && rows[j].Solved > rows[i].Solved) ||
				(rows[j].Points == rows[i].Points && rows[j].Solved == rows[i].Solved && rows[j].Username < rows[i].Username) {
				rows[i], rows[j] = rows[j], rows[i]
			}
		}
	}
	out.Board = rows
	return out
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
		Flag        string `json:"flag"`
		FlagIndex   *int   `json:"flag_index"`
		ChallengeID string `json:"challenge_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Flag) == "" {
		writeErr(w, http.StatusBadRequest, "flag required")
		return
	}
	submitted := strings.TrimSpace(body.Flag)
	// Strip accidental quotes / CR from copy-paste.
	submitted = strings.Trim(submitted, "\"'` \t\r\n")

	instCh, err := s.store.GetChallenge(inst.ChallengeID)
	if err != nil || instCh == nil {
		writeErr(w, http.StatusBadRequest, "challenge missing")
		return
	}
	// Set labs share one container: allow submitting any challenge flag for the same image.
	ch := instCh
	if body.ChallengeID != "" && body.ChallengeID != inst.ChallengeID {
		alt, err := s.store.GetChallenge(body.ChallengeID)
		if err != nil || alt == nil {
			writeErr(w, http.StatusBadRequest, "challenge missing")
			return
		}
		if alt.ImageTag != instCh.ImageTag {
			writeErr(w, http.StatusBadRequest, "challenge not in this lab set")
			return
		}
		ch = alt
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
	// Also treat flags from earlier containers of this set as already solved.
	if prior, _ := s.store.ListInstancesByUser(inst.UserID); prior != nil {
		for i := range prior {
			other := &prior[i]
			if other.ID == inst.ID {
				continue
			}
			och, err := s.store.GetChallenge(other.ChallengeID)
			if err != nil || och == nil || och.ImageTag != instCh.ImageTag {
				continue
			}
			var more []string
			_ = json.Unmarshal([]byte(other.SubmittedFlags), &more)
			for _, f := range more {
				already[f] = true
			}
		}
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

	for _, spec := range specs {
		if submitted == spec.Flag && already[spec.Flag] {
			writeErr(w, http.StatusConflict, "already submitted")
			return
		}
	}

	matchIdx := -1
	for _, idx := range candidates {
		if already[specs[idx].Flag] {
			continue
		}
		key := attemptKey(ch.ID, idx)
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
		key := attemptKey(ch.ID, bump)
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
	completed := 0
	for _, spec := range specs {
		if already[spec.Flag] || spec.Flag == specs[matchIdx].Flag {
			completed++
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":           true,
		"accepted":     specs[matchIdx].Flag,
		"completed":    completed,
		"total":        len(specs),
		"points":       specs[matchIdx].Points,
		"challenge_id": ch.ID,
	})
}

func attemptKey(challengeID string, idx int) string {
	return fmt.Sprintf("%s:%d", challengeID, idx)
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
		// Score from all submitted flags (set labs share one instance across challenges).
		for _, mid := range c.MemberIDs {
			insts, _ := s.store.ListInstancesByUser(mid)
			gotFlags := map[string]bool{}
			for _, inst := range insts {
				var flags []string
				_ = json.Unmarshal([]byte(inst.SubmittedFlags), &flags)
				for _, f := range flags {
					gotFlags[f] = true
				}
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
				awarded := 0
				for _, spec := range specs {
					if gotFlags[spec.Flag] {
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
