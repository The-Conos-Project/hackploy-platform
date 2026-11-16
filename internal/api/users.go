package api

import (
	"net/http"
)

func (s *Server) listUsers(w http.ResponseWriter, _ *http.Request) {
	list, err := s.store.ListUsers()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "store error")
		return
	}
	out := make([]map[string]any, 0, len(list))
	for _, u := range list {
		out = append(out, map[string]any{
			"id":       u.ID,
			"username": u.Username,
			"handle":   u.Handle,
			"path":     u.ProfilePath(),
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": out})
}
