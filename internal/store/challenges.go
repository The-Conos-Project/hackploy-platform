package store

import (
	"database/sql"
	"fmt"
	"time"
)

type Challenge struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	DisplayName  string    `json:"display_name"`
	Description  string    `json:"description"`
	ImageTag     string    `json:"image_tag"`
	Flags        string    `json:"flags"`        // JSON
	Credentials  string    `json:"credentials"`  // JSON
	BuildStatus  string    `json:"build_status"`
	SourcePath   string    `json:"source_path,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

func (s *Store) UpsertChallenge(c *Challenge) error {
	now := time.Now().UTC()
	if c.CreatedAt.IsZero() {
		c.CreatedAt = now
	}
	c.UpdatedAt = now
	if c.Flags == "" {
		c.Flags = "[]"
	}
	if c.Credentials == "" {
		c.Credentials = "{}"
	}
	if c.BuildStatus == "" {
		c.BuildStatus = "pending"
	}
	_, err := s.db.Exec(`
INSERT INTO challenges (id, name, display_name, description, image_tag, flags, credentials, build_status, source_path, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  display_name = excluded.display_name,
  description = excluded.description,
  image_tag = excluded.image_tag,
  flags = excluded.flags,
  credentials = excluded.credentials,
  build_status = excluded.build_status,
  source_path = excluded.source_path,
  updated_at = excluded.updated_at
`, c.ID, c.Name, c.DisplayName, c.Description, c.ImageTag, c.Flags, c.Credentials, c.BuildStatus, c.SourcePath,
		c.CreatedAt.Format(time.RFC3339Nano), c.UpdatedAt.Format(time.RFC3339Nano))
	return err
}

func (s *Store) GetChallenge(id string) (*Challenge, error) {
	row := s.db.QueryRow(`
SELECT id, name, display_name, description, image_tag, flags, credentials, build_status, COALESCE(source_path,''), created_at, updated_at
FROM challenges WHERE id = ?`, id)
	return scanChallenge(row)
}

func (s *Store) GetChallengeByName(name string) (*Challenge, error) {
	row := s.db.QueryRow(`
SELECT id, name, display_name, description, image_tag, flags, credentials, build_status, COALESCE(source_path,''), created_at, updated_at
FROM challenges WHERE name = ?`, name)
	return scanChallenge(row)
}

func (s *Store) ListChallenges() ([]Challenge, error) {
	rows, err := s.db.Query(`
SELECT id, name, display_name, description, image_tag, flags, credentials, build_status, COALESCE(source_path,''), created_at, updated_at
FROM challenges ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Challenge
	for rows.Next() {
		c, err := scanChallengeRows(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *c)
	}
	return out, rows.Err()
}

func (s *Store) DeleteChallenge(id string) error {
	res, err := s.db.Exec(`DELETE FROM challenges WHERE id = ?`, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("challenge not found")
	}
	return nil
}

func scanChallenge(row *sql.Row) (*Challenge, error) {
	var c Challenge
	var created, updated string
	err := row.Scan(&c.ID, &c.Name, &c.DisplayName, &c.Description, &c.ImageTag, &c.Flags, &c.Credentials, &c.BuildStatus, &c.SourcePath, &created, &updated)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	c.CreatedAt, _ = time.Parse(time.RFC3339Nano, created)
	c.UpdatedAt, _ = time.Parse(time.RFC3339Nano, updated)
	return &c, nil
}

func scanChallengeRows(rows *sql.Rows) (*Challenge, error) {
	var c Challenge
	var created, updated string
	if err := rows.Scan(&c.ID, &c.Name, &c.DisplayName, &c.Description, &c.ImageTag, &c.Flags, &c.Credentials, &c.BuildStatus, &c.SourcePath, &created, &updated); err != nil {
		return nil, err
	}
	c.CreatedAt, _ = time.Parse(time.RFC3339Nano, created)
	c.UpdatedAt, _ = time.Parse(time.RFC3339Nano, updated)
	return &c, nil
}
