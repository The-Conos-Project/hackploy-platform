package version

// Version is overwritten at Docker/CI build time (see .github/workflows/build.yml):
//   main  → 2.0.<run_number>+<shortsha>  (increments every push)
//   tag   → semver from git tag (v2.1.0 → 2.1.0)
// Local: go build -ldflags "-X …/internal/version.Version=…"
var Version = "2.0.0-dev"
