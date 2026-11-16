package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
)

const CookieName = "hackploy_session"

type Role string

const (
	RoleStudent Role = "student"
	RoleAdmin   Role = "admin"
)

type Session struct {
	Subject   string    `json:"sub"` // user id, or "root" for admin
	Username  string    `json:"username"`
	Role      Role      `json:"role"`
	ExpiresAt time.Time `json:"exp"`
}

type Manager struct {
	secret []byte
	ttl    time.Duration
	secure bool
}

func NewManager(secret string, ttl time.Duration, secure bool) *Manager {
	return &Manager{secret: []byte(secret), ttl: ttl, secure: secure}
}

func (m *Manager) Issue(w http.ResponseWriter, sub, username string, role Role) error {
	sess := Session{
		Subject:   sub,
		Username:  username,
		Role:      role,
		ExpiresAt: time.Now().UTC().Add(m.ttl),
	}
	token, err := m.sign(sess)
	if err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   m.secure,
		Expires:  sess.ExpiresAt,
		MaxAge:   int(m.ttl.Seconds()),
	})
	return nil
}

func (m *Manager) Clear(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   m.secure,
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
	})
}

func (m *Manager) FromRequest(r *http.Request) (*Session, error) {
	c, err := r.Cookie(CookieName)
	if err != nil {
		return nil, err
	}
	return m.verify(c.Value)
}

func (m *Manager) sign(sess Session) (string, error) {
	payload, err := json.Marshal(sess)
	if err != nil {
		return "", err
	}
	body := base64.RawURLEncoding.EncodeToString(payload)
	mac := hmac.New(sha256.New, m.secret)
	_, _ = mac.Write([]byte(body))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return body + "." + sig, nil
}

func (m *Manager) verify(token string) (*Session, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return nil, errors.New("malformed session")
	}
	mac := hmac.New(sha256.New, m.secret)
	_, _ = mac.Write([]byte(parts[0]))
	expected := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(expected), []byte(parts[1])) {
		return nil, errors.New("bad signature")
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, err
	}
	var sess Session
	if err := json.Unmarshal(raw, &sess); err != nil {
		return nil, err
	}
	if time.Now().UTC().After(sess.ExpiresAt) {
		return nil, fmt.Errorf("session expired")
	}
	return &sess, nil
}
