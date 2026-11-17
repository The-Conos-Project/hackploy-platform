package api

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/The-Conos-Project/hackploy-platform/internal/auth"
	"github.com/go-chi/chi/v5"
)

var handleRe = regexp.MustCompile(`^[a-z0-9_]{3,24}$`)

type profileStats struct {
	Points      int `json:"points"`
	Solved      int `json:"solved"`
	FirstBloods int `json:"first_bloods"`
}

func (s *Server) profilePayload(id, username, handle, path, role string) map[string]any {
	stats := s.computeProfileStats(id)
	return map[string]any{
		"id":           id,
		"username":     username,
		"handle":       handle,
		"path":         path,
		"role":         role,
		"points":       stats.Points,
		"solved":       stats.Solved,
		"first_bloods": stats.FirstBloods,
	}
}

func (s *Server) computeProfileStats(userID string) profileStats {
	var out profileStats
	if userID == "" || userID == "root" {
		return out
	}

	insts, err := s.store.ListInstancesByUser(userID)
	if err != nil {
		return out
	}
	gotFlags := map[string]bool{}
	for _, inst := range insts {
		var flags []string
		_ = json.Unmarshal([]byte(inst.SubmittedFlags), &flags)
		for _, f := range flags {
			gotFlags[f] = true
		}
	}
	all, err := s.store.ListChallenges()
	if err != nil {
		return out
	}
	for i := range all {
		ch := &all[i]
		specs := parseFlagSpecs(ch.Flags)
		awarded := 0
		for _, spec := range specs {
			if gotFlags[spec.Flag] {
				out.Points += spec.Points
				awarded++
			}
		}
		if len(specs) > 0 && awarded == len(specs) {
			out.Solved++
		}
	}

	everyone, err := s.store.ListAllInstances()
	if err != nil {
		return out
	}
	type blood struct {
		userID string
		at     time.Time
	}
	first := map[string]blood{} // flag -> earliest (set labs share flags across challenges)
	for _, inst := range everyone {
		var flags []string
		_ = json.Unmarshal([]byte(inst.SubmittedFlags), &flags)
		if len(flags) == 0 {
			continue
		}
		for _, f := range flags {
			prev, ok := first[f]
			if !ok || inst.CreatedAt.Before(prev.at) {
				first[f] = blood{userID: inst.UserID, at: inst.CreatedAt}
			}
		}
	}
	for _, b := range first {
		if b.userID == userID {
			out.FirstBloods++
		}
	}
	return out
}

func (s *Server) getProfile(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if strings.EqualFold(slug, "root") || strings.EqualFold(slug, "admin") {
		writeJSON(w, http.StatusOK, s.profilePayload("root", "root", "", "/u/root", "admin"))
		return
	}
	u, err := s.store.GetUserByProfileSlug(slug)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "store error")
		return
	}
	if u == nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	writeJSON(w, http.StatusOK, s.profilePayload(u.ID, u.Username, u.Handle, u.ProfilePath(), "student"))
}

func (s *Server) updateMyProfile(w http.ResponseWriter, r *http.Request) {
	sess := sessionFrom(r)
	if sess.Role == auth.RoleAdmin && sess.Subject == "root" {
		writeErr(w, http.StatusBadRequest, "platform admin profile has a fixed id")
		return
	}
	var body struct {
		Handle string `json:"handle"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	handle := strings.ToLower(strings.TrimSpace(body.Handle))
	if handle != "" {
		if !handleRe.MatchString(handle) {
			writeErr(w, http.StatusBadRequest, "handle must be 3-24 chars: a-z, 0-9, underscore")
			return
		}
		if handle == "root" || handle == "admin" {
			writeErr(w, http.StatusBadRequest, "handle reserved")
			return
		}
		existing, err := s.store.GetUserByHandle(handle)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "store error")
			return
		}
		if existing != nil && existing.ID != sess.Subject {
			writeErr(w, http.StatusConflict, "handle taken")
			return
		}
		// also block colliding with another user's public id
		byID, err := s.store.GetUserByID(handle)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "store error")
			return
		}
		if byID != nil && byID.ID != sess.Subject {
			writeErr(w, http.StatusConflict, "handle taken")
			return
		}
	}
	if err := s.store.UpdateUserHandle(sess.Subject, handle); err != nil {
		writeErr(w, http.StatusConflict, "handle taken")
		return
	}
	u, err := s.store.GetUserByID(sess.Subject)
	if err != nil || u == nil {
		writeErr(w, http.StatusInternalServerError, "store error")
		return
	}
	writeJSON(w, http.StatusOK, s.profilePayload(u.ID, u.Username, u.Handle, u.ProfilePath(), "student"))
}

func (h *authHandlers) changePassword(w http.ResponseWriter, r *http.Request) {
	sess, err := h.sessions.FromRequest(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, "not signed in")
		return
	}
	if sess.Role == auth.RoleAdmin {
		writeErr(w, http.StatusBadRequest, "use hackploy-reset-admin-password on the host")
		return
	}
	var body struct {
		Current string `json:"current"`
		Next    string `json:"next"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	if utf8.RuneCountInString(body.Next) < 6 || utf8.RuneCountInString(body.Next) > 128 {
		writeErr(w, http.StatusBadRequest, "password must be 6-128 characters")
		return
	}
	u, err := h.store.GetUserByID(sess.Subject)
	if err != nil || u == nil {
		writeErr(w, http.StatusNotFound, "user not found")
		return
	}
	if !auth.CheckPassword(u.PasswordHash, body.Current) {
		writeErr(w, http.StatusUnauthorized, "current password incorrect")
		return
	}
	hash, err := auth.HashPassword(body.Next)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "hash error")
		return
	}
	if err := h.store.UpdateUserPassword(u.ID, hash); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not update password")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"ok": "true"})
}
