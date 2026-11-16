package api

import (
	"context"
	"net/http"

	"github.com/The-Conos-Project/hackploy-platform/internal/auth"
)

type ctxKey int

const sessionKey ctxKey = 1

func (s *Server) requireSession(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sess, err := s.sessions.FromRequest(r)
		if err != nil {
			writeErr(w, http.StatusUnauthorized, "not signed in")
			return
		}
		ctx := context.WithValue(r.Context(), sessionKey, sess)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (s *Server) requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sess, err := s.sessions.FromRequest(r)
		if err != nil || sess.Role != auth.RoleAdmin {
			writeErr(w, http.StatusForbidden, "admin required")
			return
		}
		ctx := context.WithValue(r.Context(), sessionKey, sess)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func sessionFrom(r *http.Request) *auth.Session {
	sess, _ := r.Context().Value(sessionKey).(*auth.Session)
	return sess
}
