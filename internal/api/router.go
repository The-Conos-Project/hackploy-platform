package api

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/The-Conos-Project/hackploy-platform/internal/config"
	"github.com/The-Conos-Project/hackploy-platform/internal/health"
	"github.com/The-Conos-Project/hackploy-platform/internal/version"
	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

func NewRouter(cfg config.Config) http.Handler {
	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:5173", "http://127.0.0.1:5173"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
	}))

	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, health.Check(cfg.DataDir))
	})

	r.Get("/ready", func(w http.ResponseWriter, _ *http.Request) {
		st, code := health.Ready(cfg.DataDir)
		writeJSON(w, code, st)
	})

	r.Route("/api/v1", func(api chi.Router) {
		api.Get("/version", func(w http.ResponseWriter, _ *http.Request) {
			writeJSON(w, http.StatusOK, map[string]any{
				"version":              version.Version,
				"challenge_format":     "ctfploy.json/v1",
				"instance_timeout_sec": cfg.InstanceTimeout,
				"max_concurrent":       cfg.MaxConcurrent,
			})
		})

		// Phase placeholders — implemented one by one
		api.Get("/status", func(w http.ResponseWriter, _ *http.Request) {
			writeJSON(w, http.StatusOK, map[string]any{
				"phase":   "0-base",
				"message": "Hackploy 2.0 base is running. Auth/store/docker come next.",
				"version": version.Version,
			})
		})
	})

	serveSPA(r, cfg.StaticDir)
	return r
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func serveSPA(r chi.Router, staticDir string) {
	index := filepath.Join(staticDir, "index.html")
	if _, err := os.Stat(index); err != nil {
		r.Get("/", func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			_, _ = w.Write([]byte("Hackploy 2.0 API is up. Build the web UI: cd web && pnpm build\n"))
		})
		return
	}

	fileServer := http.FileServer(http.Dir(staticDir))
	spa := http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		rel := strings.TrimPrefix(filepath.Clean(req.URL.Path), "/")
		path := filepath.Join(staticDir, rel)
		// Prevent path escape
		if !strings.HasPrefix(path, filepath.Clean(staticDir)+string(os.PathSeparator)) &&
			path != filepath.Clean(staticDir) {
			http.NotFound(w, req)
			return
		}
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			fileServer.ServeHTTP(w, req)
			return
		}
		http.ServeFile(w, req, index)
	})
	r.Get("/", spa)
	r.Get("/*", spa)
}
