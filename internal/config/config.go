package config

import (
	"os"
	"strconv"
)

type Config struct {
	Addr           string
	DataDir        string
	AdminPassword  string
	SecretKey      string
	StaticDir      string
	InstanceTimeout int
	MaxConcurrent  int
}

func Load() Config {
	return Config{
		Addr:            env("HACKPLOY_ADDR", ":8080"),
		DataDir:         env("HACKPLOY_DATA_DIR", "./data"),
		AdminPassword:   env("ADMIN_PASSWORD", "changeme"),
		SecretKey:       env("SECRET_KEY", "dev-secret-change-me"),
		StaticDir:       env("HACKPLOY_STATIC_DIR", "./web/dist"),
		InstanceTimeout: envInt("INSTANCE_TIMEOUT", 7200),
		MaxConcurrent:   envInt("MAX_CONCURRENT_PER_USER", 2),
	}
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}
