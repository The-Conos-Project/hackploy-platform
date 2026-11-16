package version

// Version is overwritten at build time:
// go build -ldflags "-X github.com/The-Conos-Project/hackploy-platform/internal/version.Version=2.0.0"
var Version = "2.0.0-dev"
