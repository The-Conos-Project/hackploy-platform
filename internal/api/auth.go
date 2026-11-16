package api

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/The-Conos-Project/hackploy-platform/internal/auth"
	"github.com/The-Conos-Project/hackploy-platform/internal/store"
)

var usernameRe = regexp.MustCompile(`^[a-zA-Z0-9_]{3,32}$`)

type authHandlers struct {
	store   *store.Store
	sessions *auth.Manager
	adminPW string
}

type credentialsBody struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (h *authHandlers) register(w http.ResponseWriter, r *http.Request) {
	var body credentialsBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	username := strings.TrimSpace(body.Username)
	password := body.Password
	if !usernameRe.MatchString(username) {
		writeErr(w, http.StatusBadRequest, "username must be 3-32 chars: letters, numbers, underscore")
		return
	}
	if strings.EqualFold(username, "root") {
		writeErr(w, http.StatusBadRequest, "username reserved")
		return
	}
	if utf8.RuneCountInString(password) < 6 || utf8.RuneCountInString(password) > 128 {
		writeErr(w, http.StatusBadRequest, "password must be 6-128 characters")
		return
	}
	n, err := h.store.CountUsers()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "store error")
		return
	}
	if n >= store.MaxUsers {
		writeErr(w, http.StatusForbidden, "platform user limit reached")
		return
	}
	existing, err := h.store.GetUserByUsername(username)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "store error")
		return
	}
	if existing != nil {
		writeErr(w, http.StatusConflict, "username taken")
		return
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "hash error")
		return
	}
	var id string
	for attempt := 0; attempt < 12; attempt++ {
		id, err = store.RandomPublicID()
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "id error")
			return
		}
		clash, err := h.store.GetUserByID(id)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "store error")
			return
		}
		if clash == nil {
			break
		}
		id = ""
	}
	if id == "" {
		writeErr(w, http.StatusInternalServerError, "could not allocate id")
		return
	}
	user, err := h.store.CreateUser(id, username, hash)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not create user")
		return
	}
	if err := h.sessions.Issue(w, user.ID, user.Username, auth.RoleStudent); err != nil {
		writeErr(w, http.StatusInternalServerError, "session error")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"id":       user.ID,
		"username": user.Username,
		"handle":   user.Handle,
		"path":     user.ProfilePath(),
		"role":     auth.RoleStudent,
	})
}

func (h *authHandlers) login(w http.ResponseWriter, r *http.Request) {
	var body credentialsBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	username := strings.TrimSpace(body.Username)
	password := body.Password
	user, err := h.store.GetUserByUsername(username)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "store error")
		return
	}
	if user == nil || !auth.CheckPassword(user.PasswordHash, password) {
		writeErr(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	if err := h.sessions.Issue(w, user.ID, user.Username, auth.RoleStudent); err != nil {
		writeErr(w, http.StatusInternalServerError, "session error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"id":       user.ID,
		"username": user.Username,
		"handle":   user.Handle,
		"path":     user.ProfilePath(),
		"role":     auth.RoleStudent,
	})
}

func (h *authHandlers) adminLogin(w http.ResponseWriter, r *http.Request) {
	var body credentialsBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	username := strings.ToLower(strings.TrimSpace(body.Username))
	if username != "root" || body.Password != h.adminPW {
		writeErr(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	if err := h.sessions.Issue(w, "root", "root", auth.RoleAdmin); err != nil {
		writeErr(w, http.StatusInternalServerError, "session error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"id":       "root",
		"username": "root",
		"role":     auth.RoleAdmin,
	})
}

func (h *authHandlers) logout(w http.ResponseWriter, _ *http.Request) {
	h.sessions.Clear(w)
	writeJSON(w, http.StatusOK, map[string]string{"ok": "true"})
}

func (h *authHandlers) me(w http.ResponseWriter, r *http.Request) {
	sess, err := h.sessions.FromRequest(r)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, "not signed in")
		return
	}
	out := map[string]any{
		"id":       sess.Subject,
		"username": sess.Username,
		"role":     sess.Role,
		"expires":  sess.ExpiresAt,
	}
	if sess.Role != auth.RoleAdmin {
		if u, err := h.store.GetUserByID(sess.Subject); err == nil && u != nil {
			out["handle"] = u.Handle
			out["path"] = u.ProfilePath()
		}
	}
	writeJSON(w, http.StatusOK, out)
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}
