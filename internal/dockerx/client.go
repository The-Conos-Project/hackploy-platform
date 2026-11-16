package dockerx

import (
	"context"
	"os"
	"os/exec"
	"strings"
)

const NetworkName = "hackploy_net"

func Available() bool {
	if _, err := os.Stat("/var/run/docker.sock"); err != nil {
		// still allow local docker without socket path check
	}
	out, err := exec.Command("docker", "info").CombinedOutput()
	if err != nil {
		return false
	}
	return !strings.Contains(string(out), "Cannot connect")
}

func EnsureNetwork(ctx context.Context) error {
	cmd := exec.CommandContext(ctx, "docker", "network", "inspect", NetworkName)
	if err := cmd.Run(); err == nil {
		return nil
	}
	return exec.CommandContext(ctx, "docker", "network", "create", NetworkName).Run()
}
