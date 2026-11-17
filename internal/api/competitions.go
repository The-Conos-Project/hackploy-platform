package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/The-Conos-Project/hackploy-platform/internal/auth"
	"github.com/The-Conos-Project/hackploy-platform/internal/dockerx"
	"github.com/The-Conos-Project/hackploy-platform/internal/store"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func (s *Server) listCompetitions(w http.ResponseWriter, r *http.Request) {
	sess := sessionFrom(r)
	list, err := s.store.ListCompetitions()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "store error")
		return
	}
	if list == nil {
		list = []store.Competition{}
	}
	if sess.Role != auth.RoleAdmin {
		// Students see open/live/ended competitions (and ones they joined).
		filtered := make([]store.Competition, 0, len(list))
		for _, c := range list {
			if c.Status == "draft" {
				continue
			}
			filtered = append(filtered, c)
		}
		list = filtered
	}
	for i := range list {
		s.maybeEndCompetition(&list[i])
	}
	writeJSON(w, http.StatusOK, map[string]any{"competitions": list})
}

func (s *Server) createCompetition(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name        string  `json:"name"`
		MaxTeams    int     `json:"max_teams"`
		DurationMin int     `json:"duration_min"`
		JoinCloses  *string `json:"join_closes_at"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Name) == "" {
		writeErr(w, http.StatusBadRequest, "name required")
		return
	}
	c := &store.Competition{
		ID:          uuid.NewString()[:8],
		Name:        strings.TrimSpace(body.Name),
		JoinCode:    fmt.Sprintf("CMP-%s", strings.ToUpper(uuid.NewString()[:6])),
		MaxTeams:    body.MaxTeams,
		DurationMin: body.DurationMin,
		Status:      "open",
	}
	if body.JoinCloses != nil && strings.TrimSpace(*body.JoinCloses) != "" {
		t, err := parseFlexibleTime(*body.JoinCloses)
		if err != nil {
			writeErr(w, http.StatusBadRequest, "invalid join_closes_at")
			return
		}
		c.JoinClosesAt = &t
	}
	if err := s.store.CreateCompetition(c); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not create")
		return
	}
	writeJSON(w, http.StatusCreated, c)
}

func (s *Server) getCompetition(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	c, err := s.store.GetCompetition(id)
	if err != nil || c == nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	s.maybeEndCompetition(c)
	sess := sessionFrom(r)
	payload := s.competitionPayload(c, sess)
	writeJSON(w, http.StatusOK, payload)
}

func (s *Server) updateCompetition(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	c, err := s.store.GetCompetition(id)
	if err != nil || c == nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	var body struct {
		Name        *string `json:"name"`
		MaxTeams    *int    `json:"max_teams"`
		DurationMin *int    `json:"duration_min"`
		JoinCloses  *string `json:"join_closes_at"`
		Status      *string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	if body.Name != nil {
		c.Name = strings.TrimSpace(*body.Name)
	}
	if body.MaxTeams != nil {
		c.MaxTeams = *body.MaxTeams
	}
	if body.DurationMin != nil {
		c.DurationMin = *body.DurationMin
	}
	if body.JoinCloses != nil {
		if strings.TrimSpace(*body.JoinCloses) == "" {
			c.JoinClosesAt = nil
		} else {
			t, err := parseFlexibleTime(*body.JoinCloses)
			if err != nil {
				writeErr(w, http.StatusBadRequest, "invalid join_closes_at")
				return
			}
			c.JoinClosesAt = &t
		}
	}
	if body.Status != nil {
		c.Status = strings.TrimSpace(*body.Status)
	}
	if err := s.store.UpdateCompetition(c); err != nil {
		writeErr(w, http.StatusInternalServerError, "update failed")
		return
	}
	writeJSON(w, http.StatusOK, c)
}

func (s *Server) deleteCompetition(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := s.store.DeleteCompetition(id); err != nil {
		writeErr(w, http.StatusInternalServerError, "delete failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"ok": "true"})
}

func (s *Server) setCompetitionChallenges(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	c, err := s.store.GetCompetition(id)
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
	rows := make([]store.CompetitionChallenge, 0, len(body.ChallengeIDs))
	for _, cid := range body.ChallengeIDs {
		pts := 0
		if ch, _ := s.store.GetChallenge(cid); ch != nil {
			specs := parseFlagSpecs(ch.Flags)
			for _, spec := range specs {
				pts += spec.Points
			}
		}
		rows = append(rows, store.CompetitionChallenge{
			CompetitionID: id,
			ChallengeID:   cid,
			Points:        pts,
		})
	}
	if err := s.store.SetCompetitionChallenges(id, rows); err != nil {
		writeErr(w, http.StatusInternalServerError, "save failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"challenge_ids": body.ChallengeIDs})
}

func (s *Server) startCompetition(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	c, err := s.store.GetCompetition(id)
	if err != nil || c == nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	now := time.Now().UTC()
	c.StartsAt = &now
	dur := c.DurationMin
	if dur <= 0 {
		dur = 120
	}
	end := now.Add(time.Duration(dur) * time.Minute)
	c.EndsAt = &end
	c.Status = "live"
	if err := s.store.UpdateCompetition(c); err != nil {
		writeErr(w, http.StatusInternalServerError, "start failed")
		return
	}
	writeJSON(w, http.StatusOK, c)
}

func (s *Server) endCompetition(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	c, err := s.store.GetCompetition(id)
	if err != nil || c == nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	s.finalizeCompetition(c)
	writeJSON(w, http.StatusOK, c)
}

func (s *Server) joinCompetition(w http.ResponseWriter, r *http.Request) {
	_ = sessionFrom(r)
	var body struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Code) == "" {
		writeErr(w, http.StatusBadRequest, "code required")
		return
	}
	code := strings.TrimSpace(body.Code)
	c, err := s.store.GetCompetitionByJoinCode(code)
	if err != nil || c == nil {
		writeErr(w, http.StatusNotFound, "invalid join code")
		return
	}
	s.maybeEndCompetition(c)
	if c.Status == "ended" || c.Status == "draft" {
		writeErr(w, http.StatusForbidden, "competition closed")
		return
	}
	if c.JoinClosesAt != nil && time.Now().UTC().After(c.JoinClosesAt.UTC()) {
		writeErr(w, http.StatusForbidden, "join window closed")
		return
	}
	writeJSON(w, http.StatusOK, c)
}

func (s *Server) createTeam(w http.ResponseWriter, r *http.Request) {
	sess := sessionFrom(r)
	id := chi.URLParam(r, "id")
	c, err := s.store.GetCompetition(id)
	if err != nil || c == nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	s.maybeEndCompetition(c)
	if c.Status != "open" && c.Status != "live" {
		writeErr(w, http.StatusForbidden, "cannot create team")
		return
	}
	if c.JoinClosesAt != nil && time.Now().UTC().After(c.JoinClosesAt.UTC()) {
		writeErr(w, http.StatusForbidden, "join window closed")
		return
	}
	if existing, _ := s.store.FindUserTeam(id, sess.Subject); existing != nil {
		writeErr(w, http.StatusConflict, "already on a team")
		return
	}
	teams, _ := s.store.ListTeams(id)
	if len(teams) >= c.MaxTeams {
		writeErr(w, http.StatusForbidden, "team limit reached")
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Name) == "" {
		writeErr(w, http.StatusBadRequest, "name required")
		return
	}
	t := &store.Team{
		ID:            uuid.NewString()[:8],
		CompetitionID: id,
		Name:          strings.TrimSpace(body.Name),
		JoinCode:      fmt.Sprintf("TM-%s", strings.ToUpper(uuid.NewString()[:6])),
		CaptainUserID: sess.Subject,
	}
	if err := s.store.CreateTeam(t); err != nil {
		writeErr(w, http.StatusInternalServerError, "create failed")
		return
	}
	_ = s.store.AddTeamMember(t.ID, sess.Subject)
	writeJSON(w, http.StatusCreated, t)
}

func (s *Server) joinTeam(w http.ResponseWriter, r *http.Request) {
	sess := sessionFrom(r)
	id := chi.URLParam(r, "id")
	c, err := s.store.GetCompetition(id)
	if err != nil || c == nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	s.maybeEndCompetition(c)
	if c.Status == "ended" || c.Status == "draft" {
		writeErr(w, http.StatusForbidden, "competition closed")
		return
	}
	if c.JoinClosesAt != nil && time.Now().UTC().After(c.JoinClosesAt.UTC()) {
		writeErr(w, http.StatusForbidden, "join window closed")
		return
	}
	if existing, _ := s.store.FindUserTeam(id, sess.Subject); existing != nil {
		writeErr(w, http.StatusConflict, "already on a team")
		return
	}
	var body struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Code) == "" {
		writeErr(w, http.StatusBadRequest, "code required")
		return
	}
	t, err := s.store.GetTeamByJoinCode(strings.TrimSpace(body.Code))
	if err != nil || t == nil || t.CompetitionID != id {
		writeErr(w, http.StatusNotFound, "invalid team code")
		return
	}
	if err := s.store.AddTeamMember(t.ID, sess.Subject); err != nil {
		writeErr(w, http.StatusInternalServerError, "join failed")
		return
	}
	writeJSON(w, http.StatusOK, t)
}

func (s *Server) listTeams(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	c, err := s.store.GetCompetition(id)
	if err != nil || c == nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	teams, err := s.store.ListTeams(id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "store error")
		return
	}
	type memberOut struct {
		ID       string `json:"id"`
		Username string `json:"username"`
		Path     string `json:"path"`
	}
	type teamOut struct {
		store.Team
		Members []memberOut `json:"members"`
	}
	out := make([]teamOut, 0, len(teams))
	for _, t := range teams {
		uids, _ := s.store.ListTeamMembers(t.ID)
		members := make([]memberOut, 0, len(uids))
		for _, uid := range uids {
			u, _ := s.store.GetUserByID(uid)
			if u == nil {
				continue
			}
			members = append(members, memberOut{ID: u.ID, Username: u.Username, Path: u.ProfilePath()})
		}
		out = append(out, teamOut{Team: t, Members: members})
	}
	writeJSON(w, http.StatusOK, map[string]any{"teams": out})
}

func (s *Server) competitionFlag(w http.ResponseWriter, r *http.Request) {
	sess := sessionFrom(r)
	id := chi.URLParam(r, "id")
	c, err := s.store.GetCompetition(id)
	if err != nil || c == nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	s.maybeEndCompetition(c)
	if c.Status != "live" {
		writeErr(w, http.StatusForbidden, "competition not live")
		return
	}
	team, err := s.store.FindUserTeam(id, sess.Subject)
	if err != nil || team == nil {
		writeErr(w, http.StatusForbidden, "not on a team")
		return
	}
	var body struct {
		ChallengeID string `json:"challenge_id"`
		Flag        string `json:"flag"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.ChallengeID == "" || strings.TrimSpace(body.Flag) == "" {
		writeErr(w, http.StatusBadRequest, "challenge_id and flag required")
		return
	}
	assigned, _ := s.store.ListCompetitionChallenges(id)
	okCh := false
	pointsOverride := 0
	for _, a := range assigned {
		if a.ChallengeID == body.ChallengeID {
			okCh = true
			pointsOverride = a.Points
			break
		}
	}
	if !okCh {
		writeErr(w, http.StatusBadRequest, "challenge not in competition")
		return
	}
	ch, err := s.store.GetChallenge(body.ChallengeID)
	if err != nil || ch == nil {
		writeErr(w, http.StatusNotFound, "challenge missing")
		return
	}
	existing, _ := s.store.ListTeamSolves(team.ID)
	for _, sol := range existing {
		if sol.ChallengeID == body.ChallengeID {
			writeJSON(w, http.StatusOK, map[string]any{"ok": true, "already": true})
			return
		}
	}
	submitted := strings.Trim(strings.TrimSpace(body.Flag), "\"'` \t\r\n")
	specs := parseFlagSpecs(ch.Flags)
	matchIdx := -1
	for i, spec := range specs {
		if submitted == spec.Flag {
			matchIdx = i
			break
		}
	}
	if matchIdx < 0 {
		writeErr(w, http.StatusBadRequest, "incorrect")
		return
	}

	got := map[string]bool{specs[matchIdx].Flag: true}
	if insts, _ := s.store.ListInstancesByUser(sess.Subject); insts != nil {
		for i := range insts {
			och, _ := s.store.GetChallenge(insts[i].ChallengeID)
			if och == nil || och.ImageTag != ch.ImageTag {
				continue
			}
			var flags []string
			_ = json.Unmarshal([]byte(insts[i].SubmittedFlags), &flags)
			for _, f := range flags {
				got[f] = true
			}
		}
	}
	for _, spec := range specs {
		if !got[spec.Flag] {
			writeJSON(w, http.StatusOK, map[string]any{
				"ok":        true,
				"partial":   true,
				"accepted":  specs[matchIdx].Flag,
				"completed": len(got),
				"total":     len(specs),
			})
			return
		}
	}

	pts := pointsOverride
	if pts <= 0 {
		for _, spec := range specs {
			pts += spec.Points
		}
	}

	if err := s.store.UpsertTeamSolve(&store.TeamSolve{
		TeamID:      team.ID,
		ChallengeID: body.ChallengeID,
		Flag:        specs[matchIdx].Flag,
		SolvedBy:    sess.Subject,
	}); err != nil {
		writeErr(w, http.StatusInternalServerError, "save failed")
		return
	}

	total := s.teamPoints(id, team.ID)
	_ = s.store.AddCompetitionEvent(&store.CompetitionEvent{
		ID:            uuid.NewString()[:10],
		CompetitionID: id,
		TeamID:        team.ID,
		PointsTotal:   total,
	})

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":        true,
		"accepted":  specs[matchIdx].Flag,
		"points":    pts,
		"team_pts":  total,
		"completed": len(specs),
		"total":     len(specs),
	})
}


func (s *Server) teamPoints(competitionID, teamID string) int {
	assigned, _ := s.store.ListCompetitionChallenges(competitionID)
	ptsByCh := map[string]int{}
	for _, a := range assigned {
		ptsByCh[a.ChallengeID] = a.Points
	}
	solves, _ := s.store.ListTeamSolves(teamID)
	total := 0
	for _, sol := range solves {
		if strings.HasSuffix(sol.ChallengeID, ":partial") {
			continue
		}
		if p, ok := ptsByCh[sol.ChallengeID]; ok && p > 0 {
			total += p
			continue
		}
		ch, _ := s.store.GetChallenge(sol.ChallengeID)
		if ch == nil {
			continue
		}
		for _, spec := range parseFlagSpecs(ch.Flags) {
			total += spec.Points
		}
	}
	return total
}

func (s *Server) competitionStats(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	c, err := s.store.GetCompetition(id)
	if err != nil || c == nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	s.maybeEndCompetition(c)
	teams, _ := s.store.ListTeams(id)
	events, _ := s.store.ListCompetitionEvents(id)
	awards, _ := s.store.ListCompetitionAwards(id)
	solves, _ := s.store.ListCompetitionSolves(id)

	type boardRow struct {
		TeamID   string `json:"team_id"`
		TeamName string `json:"team_name"`
		Points   int    `json:"points"`
		Solved   int    `json:"solved"`
	}
	board := make([]boardRow, 0, len(teams))
	for _, t := range teams {
		ts, _ := s.store.ListTeamSolves(t.ID)
		solved := 0
		for _, sol := range ts {
			if !strings.HasSuffix(sol.ChallengeID, ":partial") {
				solved++
			}
		}
		board = append(board, boardRow{
			TeamID:   t.ID,
			TeamName: t.Name,
			Points:   s.teamPoints(id, t.ID),
			Solved:   solved,
		})
	}
	for i := 0; i < len(board); i++ {
		for j := i + 1; j < len(board); j++ {
			if board[j].Points > board[i].Points ||
				(board[j].Points == board[i].Points && board[j].Solved > board[i].Solved) ||
				(board[j].Points == board[i].Points && board[j].Solved == board[i].Solved && board[j].TeamName < board[i].TeamName) {
				board[i], board[j] = board[j], board[i]
			}
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"board":  board,
		"events": events,
		"awards": awards,
		"solves": solves,
		"status": c.Status,
		"ends_at": c.EndsAt,
	})
}

func (s *Server) competitionPayload(c *store.Competition, sess *auth.Session) map[string]any {
	chs, _ := s.store.ListCompetitionChallenges(c.ID)
	ids := make([]string, 0, len(chs))
	for _, ch := range chs {
		ids = append(ids, ch.ChallengeID)
	}
	out := map[string]any{
		"id":             c.ID,
		"name":           c.Name,
		"join_code":      c.JoinCode,
		"max_teams":      c.MaxTeams,
		"join_closes_at": c.JoinClosesAt,
		"starts_at":      c.StartsAt,
		"ends_at":        c.EndsAt,
		"duration_min":   c.DurationMin,
		"status":         c.Status,
		"created_at":     c.CreatedAt,
		"challenge_ids":  ids,
		"challenges":     chs,
	}
	if sess != nil && sess.Role != auth.RoleAdmin {
		if team, _ := s.store.FindUserTeam(c.ID, sess.Subject); team != nil {
			out["my_team"] = team
			solves, _ := s.store.ListTeamSolves(team.ID)
			out["my_solves"] = solves
		}
	}
	return out
}

func (s *Server) maybeEndCompetition(c *store.Competition) {
	if c == nil || c.Status != "live" || c.EndsAt == nil {
		return
	}
	if time.Now().UTC().After(c.EndsAt.UTC()) {
		s.finalizeCompetition(c)
	}
}

func (s *Server) finalizeCompetition(c *store.Competition) {
	if c.Status == "ended" {
		return
	}
	now := time.Now().UTC()
	if c.EndsAt == nil {
		c.EndsAt = &now
	}
	c.Status = "ended"
	_ = s.store.UpdateCompetition(c)

	// Stop running instances for competition challenge images for team members.
	chs, _ := s.store.ListCompetitionChallenges(c.ID)
	chIDs := map[string]bool{}
	imageTags := map[string]bool{}
	for _, row := range chs {
		chIDs[row.ChallengeID] = true
		if ch, _ := s.store.GetChallenge(row.ChallengeID); ch != nil {
			imageTags[ch.ImageTag] = true
		}
	}
	teams, _ := s.store.ListTeams(c.ID)
	for _, t := range teams {
		members, _ := s.store.ListTeamMembers(t.ID)
		for _, uid := range members {
			insts, _ := s.store.ListInstancesByUser(uid)
			for i := range insts {
				inst := &insts[i]
				if inst.Status != "running" {
					continue
				}
				ch, _ := s.store.GetChallenge(inst.ChallengeID)
				if ch == nil || !imageTags[ch.ImageTag] {
					continue
				}
				_ = dockerx.StopLab(context.Background(), inst.ContainerID)
				inst.Status = "stopped"
				_ = s.store.UpdateInstance(inst)
			}
		}
	}

	_ = s.store.ClearCompetitionAwards(c.ID)
	type scored struct {
		team   store.Team
		points int
		solved int
	}
	scores := make([]scored, 0, len(teams))
	for _, t := range teams {
		ts, _ := s.store.ListTeamSolves(t.ID)
		n := 0
		for _, sol := range ts {
			if !strings.HasSuffix(sol.ChallengeID, ":partial") {
				n++
			}
		}
		scores = append(scores, scored{team: t, points: s.teamPoints(c.ID, t.ID), solved: n})
	}
	for i := 0; i < len(scores); i++ {
		for j := i + 1; j < len(scores); j++ {
			if scores[j].points > scores[i].points {
				scores[i], scores[j] = scores[j], scores[i]
			}
		}
	}
	if len(scores) > 0 && scores[0].points > 0 {
		members, _ := s.store.ListTeamMembers(scores[0].team.ID)
		for _, uid := range members {
			_ = s.store.CreateCompetitionAward(&store.CompetitionAward{
				ID:            uuid.NewString()[:10],
				CompetitionID: c.ID,
				UserID:        uid,
				Kind:          "winning_team",
				Label:         fmt.Sprintf("Winner · %s", scores[0].team.Name),
			})
		}
	}

	// Most points individual (by solved_by count of points)
	indiv := map[string]int{}
	fbCount := map[string]int{}
	solves, _ := s.store.ListCompetitionSolves(c.ID)
	firstBlood := map[string]store.TeamSolve{}
	for _, sol := range solves {
		if strings.HasSuffix(sol.ChallengeID, ":partial") {
			continue
		}
		pts := 0
		for _, row := range chs {
			if row.ChallengeID == sol.ChallengeID {
				pts = row.Points
				break
			}
		}
		if pts == 0 {
			if ch, _ := s.store.GetChallenge(sol.ChallengeID); ch != nil {
				for _, spec := range parseFlagSpecs(ch.Flags) {
					pts += spec.Points
				}
			}
		}
		indiv[sol.SolvedBy] += pts
		prev, ok := firstBlood[sol.ChallengeID]
		if !ok || sol.SolvedAt.Before(prev.SolvedAt) {
			firstBlood[sol.ChallengeID] = sol
		}
	}
	for _, sol := range firstBlood {
		fbCount[sol.SolvedBy]++
	}
	topPtsUser, topPts := "", 0
	for uid, p := range indiv {
		if p > topPts {
			topPts, topPtsUser = p, uid
		}
	}
	if topPtsUser != "" {
		_ = s.store.CreateCompetitionAward(&store.CompetitionAward{
			ID:            uuid.NewString()[:10],
			CompetitionID: c.ID,
			UserID:        topPtsUser,
			Kind:          "most_points",
			Label:         "Most points",
		})
	}
	topFBUser, topFB := "", 0
	for uid, n := range fbCount {
		if n > topFB {
			topFB, topFBUser = n, uid
		}
	}
	if topFBUser != "" {
		_ = s.store.CreateCompetitionAward(&store.CompetitionAward{
			ID:            uuid.NewString()[:10],
			CompetitionID: c.ID,
			UserID:        topFBUser,
			Kind:          "most_first_bloods",
			Label:         "Most first bloods",
		})
	}
}

func parseFlexibleTime(raw string) (time.Time, error) {
	raw = strings.TrimSpace(raw)
	if t, err := time.Parse(time.RFC3339, raw); err == nil {
		return t.UTC(), nil
	}
	if t, err := time.Parse("2006-01-02T15:04", raw); err == nil {
		return t.UTC(), nil
	}
	return time.Time{}, fmt.Errorf("invalid time")
}
