package version

// Version is overwritten at Docker/CI build time from the repo VERSION file (2.x.x).
// Keep in sync with conos/apps/hackploy/public/VERSION and install.sh HACKPLOY_VERSION.
// Local: go build -ldflags "-X …/internal/version.Version=$(cat VERSION)"
var Version = "2.1.19-dev"
