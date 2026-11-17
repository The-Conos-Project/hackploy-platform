package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/The-Conos-Project/hackploy-platform/internal/store"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func (s *Server) listAssignments(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	c, err := s.store.GetClass(id)
	if err != nil || c == nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	if !s.requireGroupMember(w, r, c) {
		return
	}
	list, err := s.store.ListAssignments(id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "store error")
		return
	}
	if list == nil {
		list = []store.GroupAssignment{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"assignments": list})
}

func (s *Server) createAssignment(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	c, err := s.store.GetClass(id)
	if err != nil || c == nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	var body struct {
		SetKey       string   `json:"set_key"`
		DisplayName  string   `json:"display_name"`
		DeadlineAt   *string  `json:"deadline_at"`
		ChallengeIDs []string `json:"challenge_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	if len(body.ChallengeIDs) == 0 {
		writeErr(w, http.StatusBadRequest, "challenge_ids required")
		return
	}
	name := strings.TrimSpace(body.DisplayName)
	if name == "" {
		name = strings.TrimSpace(body.SetKey)
	}
	if name == "" {
		name = "Assignment"
	}
	a := &store.GroupAssignment{
		ID:           uuid.NewString()[:8],
		GroupID:      id,
		SetKey:       strings.TrimSpace(body.SetKey),
		DisplayName:  name,
		ChallengeIDs: body.ChallengeIDs,
	}
	if body.DeadlineAt != nil && strings.TrimSpace(*body.DeadlineAt) != "" {
		t, err := time.Parse(time.RFC3339, strings.TrimSpace(*body.DeadlineAt))
		if err != nil {
			t, err = time.Parse("2006-01-02T15:04", strings.TrimSpace(*body.DeadlineAt))
		}
		if err != nil {
			writeErr(w, http.StatusBadRequest, "invalid deadline_at")
			return
		}
		utc := t.UTC()
		a.DeadlineAt = &utc
	}
	if err := s.store.CreateAssignment(a); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not create assignment")
		return
	}
	if err := s.syncClassChallengeIDs(c); err != nil {
		writeErr(w, http.StatusInternalServerError, "sync failed")
		return
	}
	writeJSON(w, http.StatusCreated, a)
}

func (s *Server) updateAssignment(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	aid := chi.URLParam(r, "aid")
	c, err := s.store.GetClass(id)
	if err != nil || c == nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	a, err := s.store.GetAssignment(aid)
	if err != nil || a == nil || a.GroupID != id {
		writeErr(w, http.StatusNotFound, "assignment not found")
		return
	}
	var body struct {
		SetKey       *string  `json:"set_key"`
		DisplayName  *string  `json:"display_name"`
		DeadlineAt   *string  `json:"deadline_at"`
		ChallengeIDs []string `json:"challenge_ids"`
		ClearDeadline bool    `json:"clear_deadline"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	if body.SetKey != nil {
		a.SetKey = strings.TrimSpace(*body.SetKey)
	}
	if body.DisplayName != nil {
		a.DisplayName = strings.TrimSpace(*body.DisplayName)
	}
	if body.ChallengeIDs != nil {
		a.ChallengeIDs = body.ChallengeIDs
	}
	if body.ClearDeadline {
		a.DeadlineAt = nil
	} else if body.DeadlineAt != nil {
		if strings.TrimSpace(*body.DeadlineAt) == "" {
			a.DeadlineAt = nil
		} else {
			t, err := time.Parse(time.RFC3339, strings.TrimSpace(*body.DeadlineAt))
			if err != nil {
				t, err = time.Parse("2006-01-02T15:04", strings.TrimSpace(*body.DeadlineAt))
			}
			if err != nil {
				writeErr(w, http.StatusBadRequest, "invalid deadline_at")
				return
			}
			utc := t.UTC()
			a.DeadlineAt = &utc
		}
	}
	if err := s.store.UpdateAssignment(a); err != nil {
		writeErr(w, http.StatusInternalServerError, "update failed")
		return
	}
	if err := s.syncClassChallengeIDs(c); err != nil {
		writeErr(w, http.StatusInternalServerError, "sync failed")
		return
	}
	writeJSON(w, http.StatusOK, a)
}

func (s *Server) deleteAssignment(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	aid := chi.URLParam(r, "aid")
	c, err := s.store.GetClass(id)
	if err != nil || c == nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	a, err := s.store.GetAssignment(aid)
	if err != nil || a == nil || a.GroupID != id {
		writeErr(w, http.StatusNotFound, "assignment not found")
		return
	}
	if err := s.store.DeleteAssignment(aid); err != nil {
		writeErr(w, http.StatusInternalServerError, "delete failed")
		return
	}
	if err := s.syncClassChallengeIDs(c); err != nil {
		writeErr(w, http.StatusInternalServerError, "sync failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"ok": "true"})
}

func (s *Server) syncClassChallengeIDs(c *store.Class) error {
	list, err := s.store.ListAssignments(c.ID)
	if err != nil {
		return err
	}
	seen := map[string]bool{}
	ids := make([]string, 0)
	for _, a := range list {
		for _, cid := range a.ChallengeIDs {
			if seen[cid] {
				continue
			}
			seen[cid] = true
			ids = append(ids, cid)
		}
	}
	c.ChallengeIDs = ids
	return s.store.UpdateClass(c)
}

// assignmentDeadlineLocked reports whether flag submit is locked for this challenge
// for the given student (any group membership with a past deadline).
func (s *Server) assignmentDeadlineLocked(userID, challengeID string) bool {
	if isNonScoringSubject(userID) {
		return false
	}
	classes, err := s.store.ListClasses()
	if err != nil {
		return false
	}
	now := time.Now().UTC()
	for _, c := range classes {
		member := false
		for _, mid := range c.MemberIDs {
			if mid == userID {
				member = true
				break
			}
		}
		if !member {
			continue
		}
		a, err := s.store.FindAssignmentForChallenge(c.ID, challengeID)
		if err != nil || a == nil || a.DeadlineAt == nil {
			continue
		}
		if now.After(a.DeadlineAt.UTC()) {
			return true
		}
	}
	return false
}
