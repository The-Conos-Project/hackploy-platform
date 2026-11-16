package store

import (
	"crypto/rand"
	"database/sql"
	"fmt"
	"strings"
	"time"
)

const MaxUsers = 9999

type User struct {
	ID           string    `json:"id"`
	Username     string    `json:"username"`
	Handle       string    `json:"handle,omitempty"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
}

func (u User) ProfilePath() string {
	if u.Handle != "" {
		return "/u/" + u.Handle
	}
	return "/u/" + u.ID
}

func RandomPublicID() (string, error) {
	const letters = "abcdefghijklmnopqrstuvwxyz"
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	for i := range b {
		b[i] = letters[int(b[i])%len(letters)]
	}
	return string(b), nil
}

func (s *Store) CountUsers() (int, error) {
	var n int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&n)
	return n, err
}

func (s *Store) CreateUser(id, username, passwordHash string) (*User, error) {
	now := time.Now().UTC()
	_, err := s.db.Exec(
		`INSERT INTO users (id, username, handle, password_hash, created_at) VALUES (?, ?, '', ?, ?)`,
		id, username, passwordHash, now.Format(time.RFC3339Nano),
	)
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}
	return &User{ID: id, Username: username, PasswordHash: passwordHash, CreatedAt: now}, nil
}

func (s *Store) GetUserByUsername(username string) (*User, error) {
	row := s.db.QueryRow(
		`SELECT id, username, COALESCE(handle, ''), password_hash, created_at FROM users WHERE username = ? COLLATE NOCASE`,
		username,
	)
	return scanUser(row)
}

func (s *Store) GetUserByID(id string) (*User, error) {
	row := s.db.QueryRow(
		`SELECT id, username, COALESCE(handle, ''), password_hash, created_at FROM users WHERE id = ?`,
		id,
	)
	return scanUser(row)
}

func (s *Store) GetUserByHandle(handle string) (*User, error) {
	handle = strings.TrimSpace(handle)
	if handle == "" {
		return nil, nil
	}
	row := s.db.QueryRow(
		`SELECT id, username, COALESCE(handle, ''), password_hash, created_at FROM users WHERE handle = ? COLLATE NOCASE`,
		handle,
	)
	return scanUser(row)
}

func (s *Store) GetUserByProfileSlug(slug string) (*User, error) {
	slug = strings.TrimSpace(slug)
	if slug == "" {
		return nil, nil
	}
	u, err := s.GetUserByHandle(slug)
	if err != nil || u != nil {
		return u, err
	}
	return s.GetUserByID(slug)
}

func (s *Store) UpdateUserHandle(id, handle string) error {
	handle = strings.ToLower(strings.TrimSpace(handle))
	_, err := s.db.Exec(`UPDATE users SET handle = ? WHERE id = ?`, handle, id)
	return err
}

func (s *Store) UpdateUserPassword(id, passwordHash string) error {
	_, err := s.db.Exec(`UPDATE users SET password_hash = ? WHERE id = ?`, passwordHash, id)
	return err
}

func (s *Store) ListUsers() ([]User, error) {
	rows, err := s.db.Query(`SELECT id, username, COALESCE(handle, ''), password_hash, created_at FROM users ORDER BY username`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []User
	for rows.Next() {
		u, err := scanUserRow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *u)
	}
	return out, rows.Err()
}

func scanUser(row *sql.Row) (*User, error) {
	var u User
	var created string
	err := row.Scan(&u.ID, &u.Username, &u.Handle, &u.PasswordHash, &created)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	u.CreatedAt, _ = time.Parse(time.RFC3339Nano, created)
	return &u, nil
}

func scanUserRow(rows *sql.Rows) (*User, error) {
	var u User
	var created string
	if err := rows.Scan(&u.ID, &u.Username, &u.Handle, &u.PasswordHash, &created); err != nil {
		return nil, err
	}
	u.CreatedAt, _ = time.Parse(time.RFC3339Nano, created)
	return &u, nil
}
