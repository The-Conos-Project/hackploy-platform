package main

import (
	"log"
	"net/http"
	"os"

	"github.com/The-Conos-Project/hackploy-platform/internal/api"
	"github.com/The-Conos-Project/hackploy-platform/internal/config"
	"github.com/The-Conos-Project/hackploy-platform/internal/version"
)

func main() {
	cfg := config.Load()
	if err := os.MkdirAll(cfg.DataDir, 0o755); err != nil {
		log.Fatalf("data dir: %v", err)
	}

	router := api.NewRouter(cfg)
	log.Printf("Hackploy %s listening on %s", version.Version, cfg.Addr)
	if err := http.ListenAndServe(cfg.Addr, router); err != nil {
		log.Fatal(err)
	}
}
