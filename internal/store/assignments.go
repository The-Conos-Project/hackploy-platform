package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
)

type GroupAssignment struct {
	ID           string     `json:"id"`
	GroupID      string     `json:"group_id"`
	SetKey       string     `json:"set_key"`
	DisplayName  string     `json:"display_name"`
	DeadlineAt   *time.Time `json:"deadline_at,omitempty"`
	ChallengeIDs []string   `json:"challenge_ids"`
	CreatedAt    time.Time  `json:"created_at"`
}

func (s *Store) CreateAssignment(a *GroupAssignment) error {
	if a.ChallengeIDs == nil {
		a.ChallengeIDs = []string{}
	}
	if a.CreatedAt.IsZero() {
		a.CreatedAt = time.Now().UTC()
	}
	ch, _ := json.Marshal(a.ChallengeIDs)
	var deadline any
	if a.DeadlineAt != nil && !a.DeadlineAt.IsZero() {
		deadline = a.DeadlineAt.UTC().Format(time.RFC3339Nano)
	}
	_, err := s.db.Exec(
		`INSERT INTO group_assignments (id, group_id, set_key, display_name, deadline_at, challenge_ids, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
		a.ID, a.GroupID, a.SetKey, a.DisplayName, deadline, string(ch), a.CreatedAt.Format(time.RFC3339Nano),
	)
	return err
}

func (s *Store) UpdateAssignment(a *GroupAssignment) error {
	if a.ChallengeIDs == nil {
		a.ChallengeIDs = []string{}
	}
	ch, _ := json.Marshal(a.ChallengeIDs)
	var deadline any
	if a.DeadlineAt != nil && !a.DeadlineAt.IsZero() {
		deadline = a.DeadlineAt.UTC().Format(time.RFC3339Nano)
	}
	res, err := s.db.Exec(
		`UPDATE group_assignments SET set_key = ?, display_name = ?, deadline_at = ?, challenge_ids = ? WHERE id = ? AND group_id = ?`,
		a.SetKey, a.DisplayName, deadline, string(ch), a.ID, a.GroupID,
	)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("assignment not found")
	}
	return nil
}

func (s *Store) GetAssignment(id string) (*GroupAssignment, error) {
	row := s.db.QueryRow(
		`SELECT id, group_id, set_key, display_name, deadline_at, challenge_ids, created_at FROM group_assignments WHERE id = ?`, id,
	)
	return scanAssignment(row)
}

func (s *Store) ListAssignments(groupID string) ([]GroupAssignment, error) {
	rows, err := s.db.Query(
		`SELECT id, group_id, set_key, display_name, deadline_at, challenge_ids, created_at
     FROM group_assignments WHERE group_id = ? ORDER BY created_at DESC`, groupID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []GroupAssignment
	for rows.Next() {
		a, err := scanAssignmentRows(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *a)
	}
	return out, rows.Err()
}

func (s *Store) DeleteAssignment(id string) error {
	_, err := s.db.Exec(`DELETE FROM group_assignments WHERE id = ?`, id)
	return err
}

// FindAssignmentForChallenge returns the assignment covering challengeID in groupID (if any).
func (s *Store) FindAssignmentForChallenge(groupID, challengeID string) (*GroupAssignment, error) {
	list, err := s.ListAssignments(groupID)
	if err != nil {
		return nil, err
	}
	for i := range list {
		for _, cid := range list[i].ChallengeIDs {
			if cid == challengeID {
				return &list[i], nil
			}
		}
	}
	return nil, nil
}

func scanAssignment(row *sql.Row) (*GroupAssignment, error) {
	var a GroupAssignment
	var ch, created string
	var deadline sql.NullString
	err := row.Scan(&a.ID, &a.GroupID, &a.SetKey, &a.DisplayName, &deadline, &ch, &created)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return finishAssignment(&a, ch, created, deadline)
}

func scanAssignmentRows(rows *sql.Rows) (*GroupAssignment, error) {
	var a GroupAssignment
	var ch, created string
	var deadline sql.NullString
	if err := rows.Scan(&a.ID, &a.GroupID, &a.SetKey, &a.DisplayName, &deadline, &ch, &created); err != nil {
		return nil, err
	}
	return finishAssignment(&a, ch, created, deadline)
}

func finishAssignment(a *GroupAssignment, ch, created string, deadline sql.NullString) (*GroupAssignment, error) {
	_ = json.Unmarshal([]byte(ch), &a.ChallengeIDs)
	if a.ChallengeIDs == nil {
		a.ChallengeIDs = []string{}
	}
	a.CreatedAt, _ = time.Parse(time.RFC3339Nano, created)
	if deadline.Valid && deadline.String != "" {
		t, err := time.Parse(time.RFC3339Nano, deadline.String)
		if err != nil {
			t, err = time.Parse(time.RFC3339, deadline.String)
		}
		if err == nil {
			a.DeadlineAt = &t
		}
	}
	return a, nil
}
