package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/The-Conos-Project/hackploy-platform/internal/domain"
)

func (s *Server) getDomain(w http.ResponseWriter, _ *http.Request) {
	value, _, _ := s.store.GetSetting("custom_domain")
	writeJSON(w, http.StatusOK, map[string]any{
		"domain":    value,
		"public_ip": domain.PublicIP(),
	})
}

func (s *Server) saveDomain(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Domain string `json:"domain"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	prepared, err := domain.Prepare(domain.DefaultConfig(), body.Domain)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := s.store.SetSetting("custom_domain", prepared); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not save domain")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"domain":    prepared,
		"public_ip": domain.PublicIP(),
	})
}

func (s *Server) issueDomainCert(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	value, ok, _ := s.store.GetSetting("custom_domain")
	if !ok || strings.TrimSpace(value) == "" {
		writeErr(w, http.StatusBadRequest, "save a domain first")
		return
	}
	if err := domain.IssueCertificate(domain.DefaultConfig(), value, body.Email); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "domain": value})
}
