package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
)

type Class struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	JoinCode     string    `json:"join_code"`
	ChallengeIDs []string  `json:"challenge_ids"`
	MemberIDs    []string  `json:"member_ids"`
	CreatedAt    time.Time `json:"created_at"`
}

func (s *Store) CreateClass(c *Class) error {
	if c.ChallengeIDs == nil {
		c.ChallengeIDs = []string{}
	}
	if c.MemberIDs == nil {
		c.MemberIDs = []string{}
	}
	if c.CreatedAt.IsZero() {
		c.CreatedAt = time.Now().UTC()
	}
	ch, _ := json.Marshal(c.ChallengeIDs)
	mem, _ := json.Marshal(c.MemberIDs)
	_, err := s.db.Exec(
		`INSERT INTO classes (id, name, join_code, challenge_ids, member_ids, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		c.ID, c.Name, c.JoinCode, string(ch), string(mem), c.CreatedAt.Format(time.RFC3339Nano),
	)
	return err
}

func (s *Store) UpdateClass(c *Class) error {
	ch, _ := json.Marshal(c.ChallengeIDs)
	mem, _ := json.Marshal(c.MemberIDs)
	res, err := s.db.Exec(
		`UPDATE classes SET name = ?, join_code = ?, challenge_ids = ?, member_ids = ? WHERE id = ?`,
		c.Name, c.JoinCode, string(ch), string(mem), c.ID,
	)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("class not found")
	}
	return nil
}

func (s *Store) GetClass(id string) (*Class, error) {
	row := s.db.QueryRow(
		`SELECT id, name, join_code, challenge_ids, member_ids, created_at FROM classes WHERE id = ?`, id,
	)
	return scanClass(row)
}

func (s *Store) GetClassByJoinCode(code string) (*Class, error) {
	row := s.db.QueryRow(
		`SELECT id, name, join_code, challenge_ids, member_ids, created_at FROM classes WHERE join_code = ?`, code,
	)
	return scanClass(row)
}

func (s *Store) ListClasses() ([]Class, error) {
	rows, err := s.db.Query(
		`SELECT id, name, join_code, challenge_ids, member_ids, created_at FROM classes ORDER BY created_at DESC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Class
	for rows.Next() {
		c, err := scanClassRows(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *c)
	}
	return out, rows.Err()
}

func (s *Store) DeleteClass(id string) error {
	_, err := s.db.Exec(`DELETE FROM classes WHERE id = ?`, id)
	return err
}

func scanClass(row *sql.Row) (*Class, error) {
	var c Class
	var ch, mem, created string
	err := row.Scan(&c.ID, &c.Name, &c.JoinCode, &ch, &mem, &created)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal([]byte(ch), &c.ChallengeIDs)
	_ = json.Unmarshal([]byte(mem), &c.MemberIDs)
	if c.ChallengeIDs == nil {
		c.ChallengeIDs = []string{}
	}
	if c.MemberIDs == nil {
		c.MemberIDs = []string{}
	}
	c.CreatedAt, _ = time.Parse(time.RFC3339Nano, created)
	return &c, nil
}

func scanClassRows(rows *sql.Rows) (*Class, error) {
	var c Class
	var ch, mem, created string
	if err := rows.Scan(&c.ID, &c.Name, &c.JoinCode, &ch, &mem, &created); err != nil {
		return nil, err
	}
	_ = json.Unmarshal([]byte(ch), &c.ChallengeIDs)
	_ = json.Unmarshal([]byte(mem), &c.MemberIDs)
	if c.ChallengeIDs == nil {
		c.ChallengeIDs = []string{}
	}
	if c.MemberIDs == nil {
		c.MemberIDs = []string{}
	}
	c.CreatedAt, _ = time.Parse(time.RFC3339Nano, created)
	return &c, nil
}
