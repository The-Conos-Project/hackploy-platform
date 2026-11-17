package api

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/The-Conos-Project/hackploy-platform/internal/auth"
	"github.com/The-Conos-Project/hackploy-platform/internal/config"
	"github.com/The-Conos-Project/hackploy-platform/internal/health"
	"github.com/The-Conos-Project/hackploy-platform/internal/store"
	"github.com/The-Conos-Project/hackploy-platform/internal/version"
	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

type Server struct {
	cfg      config.Config
	store    *store.Store
	sessions *auth.Manager
}

func NewRouter(cfg config.Config, st *store.Store) http.Handler {
	s := &Server{
		cfg:      cfg,
		store:    st,
		sessions: auth.NewManager(cfg.SecretKey, 7*24*time.Hour, false),
	}
	ah := &authHandlers{store: st, sessions: s.sessions, adminPW: cfg.AdminPassword}

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
				"challenge_format":     "hackploy.json/v1",
				"instance_timeout_sec": cfg.InstanceTimeout,
				"max_concurrent":       cfg.MaxConcurrent,
			})
		})

		api.Get("/status", func(w http.ResponseWriter, _ *http.Request) {
			writeJSON(w, http.StatusOK, map[string]any{
				"phase":   "8-cutover",
				"message": "Installer proxies :8080; profiles, cleanup, mobile shell.",
				"version": version.Version,
			})
		})

		api.Route("/auth", func(ar chi.Router) {
			ar.Post("/register", ah.register)
			ar.Post("/login", ah.login)
			ar.Post("/admin/login", ah.adminLogin)
			ar.Post("/logout", ah.logout)
			ar.Get("/me", ah.me)
			ar.With(s.requireSession).Post("/password", ah.changePassword)
		})

		api.Get("/u/{slug}", s.getProfile)

		api.Route("/challenges", func(cr chi.Router) {
			cr.With(s.requireSession).Get("/", s.listChallenges)
			cr.With(s.requireAdmin).Post("/import-url", s.importChallengeURL)
			cr.With(s.requireAdmin).Post("/import", s.importChallengeUpload)
			cr.With(s.requireAdmin).Post("/{id}/build", s.buildChallenge)
			cr.With(s.requireAdmin).Get("/{id}/build-log", s.buildLog)
			cr.With(s.requireSession).Get("/{id}", s.getChallenge)
			cr.With(s.requireAdmin).Delete("/{id}", s.deleteChallenge)
		})

		api.Route("/updates", func(ur chi.Router) {
			ur.With(s.requireAdmin).Get("/status", s.updateStatus)
			ur.With(s.requireAdmin).Post("/apply", s.updateApply)
		})

		api.Route("/labs", func(lr chi.Router) {
			lr.With(s.requireSession).Get("/", s.listLabs)
			lr.With(s.requireSession).Post("/start", s.startLab)
			lr.With(s.requireSession).Post("/{id}/stop", s.stopLab)
			lr.With(s.requireSession).Post("/{id}/extend", s.extendLab)
			lr.With(s.requireSession).Post("/{id}/flag", s.submitFlag)
		})

		api.Route("/groups", func(gr chi.Router) {
			gr.With(s.requireSession).Get("/", s.listGroups)
			gr.With(s.requireAdmin).Post("/", s.createGroup)
			gr.With(s.requireSession).Post("/join", s.joinGroup)
			gr.With(s.requireSession).Get("/{id}", s.getGroup)
			gr.With(s.requireSession).Get("/{id}/bloods", s.groupFirstBloods)
			gr.With(s.requireSession).Get("/{id}/set-stats", s.groupSetStats)
			gr.With(s.requireSession).Get("/{id}/members", s.groupMembers)
			gr.With(s.requireAdmin).Delete("/{id}", s.deleteGroup)
			gr.With(s.requireAdmin).Put("/{id}/labs", s.assignLabs)
			gr.With(s.requireSession).Get("/{id}/assignments", s.listAssignments)
			gr.With(s.requireAdmin).Post("/{id}/assignments", s.createAssignment)
			gr.With(s.requireAdmin).Put("/{id}/assignments/{aid}", s.updateAssignment)
			gr.With(s.requireAdmin).Delete("/{id}/assignments/{aid}", s.deleteAssignment)
		})

		api.With(s.requireSession).Get("/leaderboard", s.leaderboard)
		api.With(s.requireAdmin).Get("/users/", s.listUsers)
		api.With(s.requireAdmin).Get("/metrics", s.adminMetrics)

		api.Route("/competitions", func(cr chi.Router) {
			cr.With(s.requireSession).Get("/", s.listCompetitions)
			cr.With(s.requireAdmin).Post("/", s.createCompetition)
			cr.With(s.requireSession).Post("/join", s.joinCompetition)
			cr.With(s.requireSession).Get("/{id}", s.getCompetition)
			cr.With(s.requireAdmin).Put("/{id}", s.updateCompetition)
			cr.With(s.requireAdmin).Delete("/{id}", s.deleteCompetition)
			cr.With(s.requireAdmin).Put("/{id}/challenges", s.setCompetitionChallenges)
			cr.With(s.requireAdmin).Post("/{id}/start", s.startCompetition)
			cr.With(s.requireAdmin).Post("/{id}/end", s.endCompetition)
			cr.With(s.requireSession).Get("/{id}/teams", s.listTeams)
			cr.With(s.requireSession).Post("/{id}/teams", s.createTeam)
			cr.With(s.requireSession).Post("/{id}/teams/join", s.joinTeam)
			cr.With(s.requireSession).Post("/{id}/flag", s.competitionFlag)
			cr.With(s.requireSession).Get("/{id}/stats", s.competitionStats)
		})

		api.Route("/domain", func(dr chi.Router) {
			dr.With(s.requireAdmin).Get("/", s.getDomain)
			dr.With(s.requireAdmin).Post("/", s.saveDomain)
			dr.With(s.requireAdmin).Post("/certificate", s.issueDomainCert)
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
			_, _ = w.Write([]byte("Hackploy API is up. Build the web UI: cd web && pnpm build\n"))
		})
		return
	}

	fileServer := http.FileServer(http.Dir(staticDir))
	spa := http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		rel := strings.TrimPrefix(filepath.Clean(req.URL.Path), "/")
		path := filepath.Join(staticDir, rel)
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
