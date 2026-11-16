package health

import (
	"net/http"
	"os"
	"path/filepath"

	"github.com/The-Conos-Project/hackploy-platform/internal/version"
)

type Status struct {
	Status  string `json:"status"`
	Version string `json:"version"`
	Docker  string `json:"docker"`
	DB      string `json:"db"`
}

func Check(dataDir string) Status {
	st := Status{
		Status:  "ok",
		Version: version.Version,
		Docker:  "unchecked", // wired in phase 4
		DB:      "ok",
	}

	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		st.DB = "error"
		st.Status = "degraded"
		return st
	}
	probe := filepath.Join(dataDir, ".write-probe")
	if err := os.WriteFile(probe, []byte("ok"), 0o600); err != nil {
		st.DB = "error"
		st.Status = "degraded"
		return st
	}
	_ = os.Remove(probe)
	return st
}

func Ready(dataDir string) (Status, int) {
	st := Check(dataDir)
	if st.DB != "ok" {
		return st, http.StatusServiceUnavailable
	}
	return st, http.StatusOK
}
