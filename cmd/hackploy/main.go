package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/The-Conos-Project/hackploy-platform/internal/api"
	"github.com/The-Conos-Project/hackploy-platform/internal/cleanup"
	"github.com/The-Conos-Project/hackploy-platform/internal/config"
	"github.com/The-Conos-Project/hackploy-platform/internal/domain"
	"github.com/The-Conos-Project/hackploy-platform/internal/store"
	"github.com/The-Conos-Project/hackploy-platform/internal/version"
)

func main() {
	cfg := config.Load()
	if err := os.MkdirAll(cfg.DataDir, 0o755); err != nil {
		log.Fatalf("data dir: %v", err)
	}

	st, err := store.Open(cfg.DataDir)
	if err != nil {
		log.Fatalf("store: %v", err)
	}
	defer st.Close()

	// Heal upgrades from 1.x where nginx still proxies :8000
	domain.MigrateLegacyProxy(domain.DefaultConfig())

	cleanup.StartExpiredLabs(st, time.Minute)

	router := api.NewRouter(cfg, st)
	log.Printf("Hackploy %s listening on %s", version.Version, cfg.Addr)
	if err := http.ListenAndServe(cfg.Addr, router); err != nil {
		log.Fatal(err)
	}
}
