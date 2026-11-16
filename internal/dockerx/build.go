package dockerx

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
)

func BuildLogPath(dataDir, tag string) string {
	safe := filepath.Base(tag)
	return filepath.Join(dataDir, "build-logs", safe+".log")
}

func EnsureLogDir(dataDir string) error {
	return os.MkdirAll(filepath.Join(dataDir, "build-logs"), 0o755)
}

func BuildImage(ctx context.Context, contextDir, tag string, logWriter io.Writer) error {
	if logWriter == nil {
		logWriter = io.Discard
	}
	if _, err := os.Stat(filepath.Join(contextDir, "Dockerfile")); err != nil {
		return fmt.Errorf("Dockerfile missing in %s", contextDir)
	}
	_, _ = io.WriteString(logWriter, "Build started...\n")
	cmd := exec.CommandContext(ctx, "docker", "build", "-t", tag, "-t", tag+":latest", contextDir)
	cmd.Stdout = logWriter
	cmd.Stderr = logWriter
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("docker build failed: %w", err)
	}
	_, _ = io.WriteString(logWriter, "Build completed successfully!\n")
	return nil
}
