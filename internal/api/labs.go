package api

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/The-Conos-Project/hackploy-platform/internal/auth"
	"github.com/The-Conos-Project/hackploy-platform/internal/dockerx"
	"github.com/The-Conos-Project/hackploy-platform/internal/store"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func (s *Server) buildChallenge(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	ch, err := s.store.GetChallenge(id)
	if err != nil || ch == nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	if ch.SourcePath == "" {
		writeErr(w, http.StatusBadRequest, "no source path")
		return
	}
	go s.runBuild(ch.ID, ch.SourcePath, ch.ImageTag)
	writeJSON(w, http.StatusAccepted, map[string]string{"ok": "true", "status": "building"})
}

func (s *Server) runBuild(challengeID, sourcePath, imageTag string) {
	_ = dockerx.EnsureLogDir(s.cfg.DataDir)
	logPath := dockerx.BuildLogPath(s.cfg.DataDir, imageTag)
	f, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		return
	}
	defer f.Close()

	s.setImageStatus(imageTag, "building")
	_, _ = f.WriteString("Build started...\n")
	if err := dockerx.BuildImage(context.Background(), sourcePath, imageTag, f); err != nil {
		_, _ = f.WriteString(err.Error() + "\n")
		s.setImageStatus(imageTag, "failed")
		return
	}
	s.setImageStatus(imageTag, "ready")
}

func (s *Server) setImageStatus(imageTag, status string) {
	all, err := s.store.ListChallenges()
	if err != nil {
		return
	}
	for i := range all {
		if all[i].ImageTag == imageTag {
			all[i].BuildStatus = status
			_ = s.store.UpsertChallenge(&all[i])
		}
	}
}

func (s *Server) startLab(w http.ResponseWriter, r *http.Request) {
	sess := sessionFrom(r)
	if sess == nil {
		writeErr(w, http.StatusUnauthorized, "not signed in")
		return
	}
	var body struct {
		ChallengeID string `json:"challenge_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.ChallengeID == "" {
		writeErr(w, http.StatusBadRequest, "challenge_id required")
		return
	}
	ch, err := s.store.GetChallenge(body.ChallengeID)
	if err != nil || ch == nil {
		writeErr(w, http.StatusNotFound, "challenge not found")
		return
	}
	if ch.BuildStatus != "ready" {
		writeErr(w, http.StatusBadRequest, "lab image not ready — build first")
		return
	}

	n, err := dockerx.CountRunningForUser(r.Context(), sess.Subject)
	if err != nil {
		writeErr(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	if n >= s.cfg.MaxConcurrent {
		writeErr(w, http.StatusTooManyRequests, "maximum concurrent labs reached")
		return
	}

	var creds map[string]string
	_ = json.Unmarshal([]byte(ch.Credentials), &creds)
	pkg := strings.TrimPrefix(ch.ImageTag, "hackploy-")

	lab, err := dockerx.StartLab(r.Context(), dockerx.StartRequest{
		ChallengeID:   ch.ID,
		ImageTag:      ch.ImageTag,
		UserID:        sess.Subject,
		Username:      creds["username"],
		Password:      creds["password"],
		ChallengeName: ch.Name,
		PackageName:   pkg,
		TimeoutSec:    s.cfg.InstanceTimeout,
	})
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}

	port := lab.HostPort
	inst := &store.Instance{
		ID:             lab.InstanceID,
		UserID:         sess.Subject,
		ChallengeID:    ch.ID,
		ContainerID:    lab.ContainerID,
		ContainerName:  lab.ContainerName,
		HostPort:       &port,
		ConnectionType: lab.Connection,
		Status:         "running",
		CreatedAt:      time.Now().UTC(),
		ExpiresAt:      &lab.ExpiresAt,
		Username:       lab.Username,
		Password:       lab.Password,
		SubmittedFlags: "[]",
		AttemptCounts:  "{}",
	}
	if err := s.store.CreateInstance(inst); err != nil {
		_ = dockerx.StopLab(r.Context(), lab.ContainerID)
		writeErr(w, http.StatusInternalServerError, "could not save instance")
		return
	}
	writeJSON(w, http.StatusCreated, inst)
}

func (s *Server) stopLab(w http.ResponseWriter, r *http.Request) {
	sess := sessionFrom(r)
	id := chi.URLParam(r, "id")
	inst, err := s.store.GetInstance(id)
	if err != nil || inst == nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	if sess.Role != auth.RoleAdmin && inst.UserID != sess.Subject {
		writeErr(w, http.StatusForbidden, "forbidden")
		return
	}
	if inst.ContainerID != "" {
		_ = dockerx.StopLab(r.Context(), inst.ContainerID)
	}
	inst.Status = "stopped"
	_ = s.store.UpdateInstance(inst)
	writeJSON(w, http.StatusOK, map[string]string{"ok": "true"})
}

func (s *Server) extendLab(w http.ResponseWriter, r *http.Request) {
	sess := sessionFrom(r)
	id := chi.URLParam(r, "id")
	inst, err := s.store.GetInstance(id)
	if err != nil || inst == nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	if sess.Role != auth.RoleAdmin && inst.UserID != sess.Subject {
		writeErr(w, http.StatusForbidden, "forbidden")
		return
	}
	if inst.Status != "running" {
		writeErr(w, http.StatusBadRequest, "lab is not running")
		return
	}
	exp := time.Now().UTC().Add(time.Duration(s.cfg.InstanceTimeout) * time.Second)
	inst.ExpiresAt = &exp
	if err := s.store.UpdateInstance(inst); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not extend")
		return
	}
	writeJSON(w, http.StatusOK, inst)
}

func (s *Server) listLabs(w http.ResponseWriter, r *http.Request) {
	sess := sessionFrom(r)
	var list []store.Instance
	var err error
	if sess.Role == auth.RoleAdmin {
		list, err = s.store.ListRunningInstances()
	} else {
		list, err = s.store.ListInstancesByUser(sess.Subject)
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "store error")
		return
	}
	if list == nil {
		list = []store.Instance{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"labs": list})
}

func (s *Server) buildLog(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	ch, err := s.store.GetChallenge(id)
	if err != nil || ch == nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	path := dockerx.BuildLogPath(s.cfg.DataDir, ch.ImageTag)
	raw, err := os.ReadFile(path)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]string{"log": ""})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"log": string(raw)})
}

func (s *Server) triggerBuildAfterImport(imageTag, sourceDir string, challengeIDs []string) {
	if sourceDir == "" || imageTag == "" {
		return
	}
	if _, err := os.Stat(filepath.Join(sourceDir, "Dockerfile")); err != nil {
		return
	}
	id := uuid.NewString()[:8]
	if len(challengeIDs) > 0 && challengeIDs[0] != "" {
		id = challengeIDs[0]
	}
	go s.runBuild(id, sourceDir, imageTag)
}
