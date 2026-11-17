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

	// Reuse this student's already-running container for the same challenge image
	// (challenges in a set share one lab). Dead/orphan rows are marked stopped.
	if existing := s.runningInstanceForImage(r.Context(), sess.Subject, ch.ImageTag); existing != nil {
		writeJSON(w, http.StatusOK, existing)
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
	setName := strings.TrimPrefix(ch.ImageTag, "hackploy-")

	// Multi-challenge sets share one image — leave ChallengeName empty so the
	// container exposes every challenge (not a single pinned challenge).
	challengeCount := 0
	if all, err := s.store.ListChallenges(); err == nil {
		for i := range all {
			if all[i].ImageTag == ch.ImageTag {
				challengeCount++
			}
		}
	}
	challengeName := ""
	if challengeCount <= 1 {
		challengeName = ch.Name
	}

	lab, err := dockerx.StartLab(r.Context(), dockerx.StartRequest{
		ChallengeID:   ch.ID,
		ImageTag:      ch.ImageTag,
		UserID:        sess.Subject,
		Username:      creds["username"],
		Password:      creds["password"],
		ChallengeName: challengeName,
		SetName:       setName,
		TimeoutSec:    s.cfg.InstanceTimeout,
	})
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}

	// Keep solve progress across destroy/recreate; container FS is still fresh.
	priorFlags, priorAttempts := s.priorSetProgress(sess.Subject, ch.ImageTag)

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
		SubmittedFlags: priorFlags,
		AttemptCounts:  priorAttempts,
	}
	if err := s.store.CreateInstance(inst); err != nil {
		_ = dockerx.StopLab(r.Context(), lab.ContainerID)
		writeErr(w, http.StatusInternalServerError, "could not save instance")
		return
	}
	writeJSON(w, http.StatusCreated, inst)
}

func (s *Server) runningInstanceForImage(ctx context.Context, userID, imageTag string) *store.Instance {
	list, err := s.store.ListInstancesByUser(userID)
	if err != nil {
		return nil
	}
	for i := range list {
		inst := &list[i]
		if inst.Status != "running" {
			continue
		}
		ch, err := s.store.GetChallenge(inst.ChallengeID)
		if err != nil || ch == nil || ch.ImageTag != imageTag {
			continue
		}
		if dockerx.ContainerRunning(ctx, inst.ContainerID) {
			return inst
		}
		inst.Status = "stopped"
		_ = s.store.UpdateInstance(inst)
	}
	return nil
}

func (s *Server) priorSetProgress(userID, imageTag string) (flagsJSON, attemptsJSON string) {
	flagsJSON, attemptsJSON = "[]", "{}"
	list, err := s.store.ListInstancesByUser(userID)
	if err != nil {
		return flagsJSON, attemptsJSON
	}
	flagSet := map[string]bool{}
	attempts := map[string]int{}
	for i := range list {
		inst := &list[i]
		ch, err := s.store.GetChallenge(inst.ChallengeID)
		if err != nil || ch == nil || ch.ImageTag != imageTag {
			continue
		}
		var flags []string
		_ = json.Unmarshal([]byte(inst.SubmittedFlags), &flags)
		for _, f := range flags {
			flagSet[f] = true
		}
		var att map[string]int
		_ = json.Unmarshal([]byte(inst.AttemptCounts), &att)
		for k, v := range att {
			if v > attempts[k] {
				attempts[k] = v
			}
		}
	}
	out := make([]string, 0, len(flagSet))
	for f := range flagSet {
		out = append(out, f)
	}
	if b, err := json.Marshal(out); err == nil {
		flagsJSON = string(b)
	}
	if b, err := json.Marshal(attempts); err == nil {
		attemptsJSON = string(b)
	}
	return flagsJSON, attemptsJSON
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
	// Enrich for machines FAB / set matching (image tag + display name).
	chCache := map[string]*store.Challenge{}
	out := make([]map[string]any, 0, len(list))
	for i := range list {
		inst := &list[i]
		row := map[string]any{
			"id":               inst.ID,
			"user_id":          inst.UserID,
			"challenge_id":     inst.ChallengeID,
			"host_port":        inst.HostPort,
			"connection_type":  inst.ConnectionType,
			"status":           inst.Status,
			"expires_at":       inst.ExpiresAt,
			"username":         inst.Username,
			"password":         inst.Password,
			"submitted_flags":  inst.SubmittedFlags,
			"attempt_counts":   inst.AttemptCounts,
			"container_name":   inst.ContainerName,
		}
		ch := chCache[inst.ChallengeID]
		if ch == nil {
			ch, _ = s.store.GetChallenge(inst.ChallengeID)
			if ch != nil {
				chCache[inst.ChallengeID] = ch
			}
		}
		if ch != nil {
			row["image_tag"] = ch.ImageTag
			row["challenge_name"] = ch.DisplayName
			if ch.DisplayName == "" {
				row["challenge_name"] = ch.Name
			}
			row["set_name"] = strings.TrimPrefix(ch.ImageTag, "hackploy-")
		}
		out = append(out, row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"labs": out})
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
