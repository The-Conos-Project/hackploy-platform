package api

import (
	"net/http"

	"github.com/The-Conos-Project/hackploy-platform/internal/update"
	"github.com/The-Conos-Project/hackploy-platform/internal/version"
)

func (s *Server) updateStatus(w http.ResponseWriter, r *http.Request) {
	checker := update.NewChecker(s.cfg.PlatformImage)
	st := checker.Check(r.Context())
	writeJSON(w, http.StatusOK, st)
}

func (s *Server) updateApply(w http.ResponseWriter, r *http.Request) {
	if err := update.Apply(r.Context(), s.cfg.ComposeDir, s.cfg.UpdateHelperImg); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	update.WaitBrief()
	writeJSON(w, http.StatusAccepted, map[string]any{
		"ok":      true,
		"message": "Update started. The platform will restart shortly.",
		"version": version.Version,
	})
}
