package api

import (
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/The-Conos-Project/hackploy-platform/internal/challenges"
	"github.com/The-Conos-Project/hackploy-platform/internal/store"
	"github.com/go-chi/chi/v5"
)

func (s *Server) listChallenges(w http.ResponseWriter, _ *http.Request) {
	list, err := s.store.ListChallenges()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "store error")
		return
	}
	if list == nil {
		list = []store.Challenge{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"challenges": list})
}

func (s *Server) getChallenge(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	ch, err := s.store.GetChallenge(id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "store error")
		return
	}
	if ch == nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	writeJSON(w, http.StatusOK, ch)
}

func (s *Server) importChallengeURL(w http.ResponseWriter, r *http.Request) {
	var body struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.URL) == "" {
		writeErr(w, http.StatusBadRequest, "url required")
		return
	}
	u, err := url.Parse(body.URL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		writeErr(w, http.StatusBadRequest, "invalid url")
		return
	}
	client := &http.Client{Timeout: 60 * time.Second}
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, body.URL, nil)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid url")
		return
	}
	req.Header.Set("User-Agent", "Hackploy/2.0")
	resp, err := client.Do(req)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "download failed")
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		writeErr(w, http.StatusBadGateway, "download failed")
		return
	}
	result, err := challenges.ImportTarGz(s.store, s.cfg.DataDir, resp.Body)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	s.triggerBuildAfterImport(result.ImageTag, result.SourceDir, result.ChallengeIDs)
	writeJSON(w, http.StatusCreated, result)
}

func (s *Server) importChallengeUpload(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(100 << 20); err != nil {
		writeErr(w, http.StatusBadRequest, "multipart required")
		return
	}
	file, _, err := r.FormFile("file")
	if err != nil {
		writeErr(w, http.StatusBadRequest, "file required")
		return
	}
	defer file.Close()
	result, err := challenges.ImportTarGz(s.store, s.cfg.DataDir, file)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	s.triggerBuildAfterImport(result.ImageTag, result.SourceDir, result.ChallengeIDs)
	writeJSON(w, http.StatusCreated, result)
}

func (s *Server) deleteChallenge(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	ch, err := s.store.GetChallenge(id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "store error")
		return
	}
	if ch == nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	if err := s.store.DeleteChallenge(id); err != nil {
		writeErr(w, http.StatusInternalServerError, "delete failed")
		return
	}
	// remove set source dir only if no other challenge shares it
	others, _ := s.store.ListChallenges()
	shared := false
	for _, o := range others {
		if o.SourcePath != "" && o.SourcePath == ch.SourcePath {
			shared = true
			break
		}
	}
	if !shared && ch.SourcePath != "" {
		_ = os.RemoveAll(ch.SourcePath)
	}
	writeJSON(w, http.StatusOK, map[string]string{"ok": "true"})
}
