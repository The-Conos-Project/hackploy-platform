package api

import (
	"net/http"

	"github.com/The-Conos-Project/hackploy-platform/internal/sysinfo"
)

func (s *Server) adminMetrics(w http.ResponseWriter, _ *http.Request) {
	snap := sysinfo.Collect(s.cfg.DataDir)

	challenges, _ := s.store.ListChallenges()
	groups, _ := s.store.ListClasses()
	users, _ := s.store.ListUsers()
	running, _ := s.store.ListRunningInstances()

	ready := 0
	for _, ch := range challenges {
		if ch.BuildStatus == "ready" {
			ready++
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"cpu_percent":      round1(snap.CPUPercent),
		"mem_used_bytes":   snap.MemUsedBytes,
		"mem_total_bytes":  snap.MemTotalBytes,
		"mem_percent":      round1(snap.MemPercent),
		"disk_used_bytes":  snap.DiskUsedBytes,
		"disk_total_bytes": snap.DiskTotalBytes,
		"disk_percent":     round1(snap.DiskPercent),
		"load_1":           round1(snap.Load1),
		"num_cpu":          snap.NumCPU,
		"active_labs":      len(running),
		"challenges":       len(challenges),
		"ready_challenges": ready,
		"groups":           len(groups),
		"users":            len(users),
	})
}

func round1(v float64) float64 {
	return float64(int(v*10+0.5)) / 10
}
