package domain

import (
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

var domainRe = regexp.MustCompile(`^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$`)
var emailRe = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)

type Config struct {
	NginxConfig string
	AcmeVolume  string
	CertVolume  string
}

func DefaultConfig() Config {
	return Config{
		NginxConfig: env("NGINX_CONFIG_PATH", "/etc/hackploy/nginx/default.conf"),
		AcmeVolume:  env("ACME_VOLUME", "hackploy-acme"),
		CertVolume:  env("CERT_VOLUME", "hackploy-certs"),
	}
}

func env(k, fallback string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return fallback
}

func Normalize(value string) (string, error) {
	domain := strings.TrimSuffix(strings.ToLower(strings.TrimSpace(value)), ".")
	if !domainRe.MatchString(domain) {
		return "", fmt.Errorf("enter a valid domain such as ctf.example.com")
	}
	return domain, nil
}

func PublicIP() string {
	client := &http.Client{Timeout: 4 * time.Second}
	for _, url := range []string{"https://api.ipify.org", "https://ifconfig.io/ip"} {
		resp, err := client.Get(url)
		if err != nil {
			continue
		}
		buf := make([]byte, 64)
		n, _ := resp.Body.Read(buf)
		_ = resp.Body.Close()
		if n > 0 {
			return strings.TrimSpace(string(buf[:n]))
		}
	}
	return "your VPS public IP"
}

func nginxConfig(domain string, secured bool) string {
	acme := "location ^~ /.well-known/acme-challenge/ { root /var/www/certbot; }"
	proxy := "location / { proxy_pass http://platform:8080; proxy_http_version 1.1; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; proxy_buffering off; proxy_read_timeout 86400s; }"
	if !secured {
		return fmt.Sprintf("server { listen 80; server_name %s; %s %s }\n", domain, acme, proxy)
	}
	return fmt.Sprintf(
		"server { listen 80; server_name %s; %s location / { return 301 https://$host$request_uri; } }\n"+
			"server { listen 443 ssl; server_name %s; ssl_certificate /etc/letsencrypt/live/%s/fullchain.pem; ssl_certificate_key /etc/letsencrypt/live/%s/privkey.pem; %s }\n",
		domain, acme, domain, domain, domain, proxy,
	)
}

func writeConfig(cfg Config, domain string, secured bool) error {
	if err := os.MkdirAll(filepath.Dir(cfg.NginxConfig), 0o755); err != nil {
		return err
	}
	return os.WriteFile(cfg.NginxConfig, []byte(nginxConfig(domain, secured)), 0o644)
}

// MigrateLegacyProxy rewrites leftover 1.x nginx upstreams (platform:8000 → :8080)
// and reloads nginx when the config file is mounted from the host.
func MigrateLegacyProxy(cfg Config) {
	path := cfg.NginxConfig
	raw, err := os.ReadFile(path)
	if err != nil {
		return
	}
	text := string(raw)
	if !strings.Contains(text, "platform:8000") {
		return
	}
	next := strings.ReplaceAll(text, "http://platform:8000", "http://platform:8080")
	if next == text {
		return
	}
	if err := os.WriteFile(path, []byte(next), 0o644); err != nil {
		return
	}
	if err := reloadNginx(); err != nil {
		// best-effort — host may still need: docker exec … nginx -s reload
		return
	}
}

func reloadNginx() error {
	out, err := exec.Command("docker", "ps", "--filter", "label=com.docker.compose.service=nginx", "--format", "{{.ID}}").Output()
	if err != nil {
		return fmt.Errorf("nginx container not found — re-run the Hackploy installer")
	}
	id := strings.TrimSpace(string(out))
	if id == "" {
		return fmt.Errorf("nginx container not found — re-run the Hackploy installer")
	}
	if err := exec.Command("docker", "exec", id, "nginx", "-s", "reload").Run(); err != nil {
		return fmt.Errorf("nginx reload failed: %w", err)
	}
	return nil
}

func Prepare(cfg Config, value string) (string, error) {
	domain, err := Normalize(value)
	if err != nil {
		return "", err
	}
	if err := writeConfig(cfg, domain, false); err != nil {
		return "", err
	}
	if err := reloadNginx(); err != nil {
		return "", err
	}
	return domain, nil
}

func IssueCertificate(cfg Config, value, email string) error {
	domain, err := Normalize(value)
	if err != nil {
		return err
	}
	email = strings.TrimSpace(email)
	if !emailRe.MatchString(email) {
		return fmt.Errorf("enter a valid certificate email")
	}
	cmd := exec.Command("docker", "run", "--rm",
		"-v", cfg.AcmeVolume+":/var/www/certbot",
		"-v", cfg.CertVolume+":/etc/letsencrypt",
		"certbot/certbot:latest",
		"certonly", "--webroot", "-w", "/var/www/certbot",
		"--non-interactive", "--agree-tos",
		"--email", email, "-d", domain,
	)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("certbot: %w (%s)", err, strings.TrimSpace(string(out)))
	}
	if err := writeConfig(cfg, domain, true); err != nil {
		return err
	}
	return reloadNginx()
}
