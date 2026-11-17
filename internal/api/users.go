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
	out := make([]map[string]any, 0, len(list)+1)
	out = append(out, map[string]any{
		"id":       "root",
		"username": "root",
		"handle":   "",
		"path":     "/u/root",
		"role":     "admin",
	})
	for _, u := range list {
		out = append(out, map[string]any{
			"id":       u.ID,
			"username": u.Username,
			"handle":   u.Handle,
			"path":     u.ProfilePath(),
			"role":     "student",
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": out})
}
