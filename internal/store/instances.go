package store

import (
	"database/sql"
	"fmt"
	"time"
)

type Instance struct {
	ID              string     `json:"id"`
	UserID          string     `json:"user_id"`
	ChallengeID     string     `json:"challenge_id"`
	FlagIndex       int        `json:"flag_index"`
	ContainerID     string     `json:"container_id,omitempty"`
	ContainerName   string     `json:"container_name,omitempty"`
	HostPort        *int       `json:"host_port,omitempty"`
	ConnectionType  string     `json:"connection_type"`
	Status          string     `json:"status"`
	CreatedAt       time.Time  `json:"created_at"`
	ExpiresAt       *time.Time `json:"expires_at,omitempty"`
	DynamicFlag     string     `json:"-"`
	Flag            string     `json:"-"`
	SubmittedFlags  string     `json:"submitted_flags"`
	AttemptCounts   string     `json:"attempt_counts"`
	Username        string     `json:"username,omitempty"`
	Password        string     `json:"password,omitempty"`
}

func (s *Store) CreateInstance(inst *Instance) error {
	if inst.CreatedAt.IsZero() {
		inst.CreatedAt = time.Now().UTC()
	}
	if inst.ConnectionType == "" {
		inst.ConnectionType = "ssh"
	}
	if inst.Status == "" {
		inst.Status = "stopped"
	}
	if inst.SubmittedFlags == "" {
		inst.SubmittedFlags = "[]"
	}
	if inst.AttemptCounts == "" {
		inst.AttemptCounts = "{}"
	}
	var hostPort any
	if inst.HostPort != nil {
		hostPort = *inst.HostPort
	}
	var expires any
	if inst.ExpiresAt != nil {
		expires = inst.ExpiresAt.Format(time.RFC3339Nano)
	}
	_, err := s.db.Exec(`
INSERT INTO instances (
  id, user_id, challenge_id, flag_index, container_id, container_name, host_port,
  connection_type, status, created_at, expires_at, dynamic_flag, flag,
  submitted_flags, attempt_counts, username, password
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		inst.ID, inst.UserID, inst.ChallengeID, inst.FlagIndex, nullStr(inst.ContainerID), nullStr(inst.ContainerName),
		hostPort, inst.ConnectionType, inst.Status, inst.CreatedAt.Format(time.RFC3339Nano), expires,
		nullStr(inst.DynamicFlag), nullStr(inst.Flag), inst.SubmittedFlags, inst.AttemptCounts,
		nullStr(inst.Username), nullStr(inst.Password),
	)
	return err
}

func (s *Store) UpdateInstance(inst *Instance) error {
	var hostPort any
	if inst.HostPort != nil {
		hostPort = *inst.HostPort
	}
	var expires any
	if inst.ExpiresAt != nil {
		expires = inst.ExpiresAt.Format(time.RFC3339Nano)
	}
	res, err := s.db.Exec(`
UPDATE instances SET
  flag_index = ?, container_id = ?, container_name = ?, host_port = ?,
  connection_type = ?, status = ?, expires_at = ?, dynamic_flag = ?, flag = ?,
  submitted_flags = ?, attempt_counts = ?, username = ?, password = ?
WHERE id = ?`,
		inst.FlagIndex, nullStr(inst.ContainerID), nullStr(inst.ContainerName), hostPort,
		inst.ConnectionType, inst.Status, expires, nullStr(inst.DynamicFlag), nullStr(inst.Flag),
		inst.SubmittedFlags, inst.AttemptCounts, nullStr(inst.Username), nullStr(inst.Password),
		inst.ID,
	)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("instance not found")
	}
	return nil
}

func (s *Store) GetInstance(id string) (*Instance, error) {
	row := s.db.QueryRow(`
SELECT id, user_id, challenge_id, flag_index, container_id, container_name, host_port,
  connection_type, status, created_at, expires_at, dynamic_flag, flag,
  submitted_flags, attempt_counts, username, password
FROM instances WHERE id = ?`, id)
	return scanInstance(row)
}

func (s *Store) ListInstancesByUser(userID string) ([]Instance, error) {
	rows, err := s.db.Query(`
SELECT id, user_id, challenge_id, flag_index, container_id, container_name, host_port,
  connection_type, status, created_at, expires_at, dynamic_flag, flag,
  submitted_flags, attempt_counts, username, password
FROM instances WHERE user_id = ? ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return collectInstances(rows)
}

func (s *Store) ListRunningInstances() ([]Instance, error) {
	rows, err := s.db.Query(`
SELECT id, user_id, challenge_id, flag_index, container_id, container_name, host_port,
  connection_type, status, created_at, expires_at, dynamic_flag, flag,
  submitted_flags, attempt_counts, username, password
FROM instances WHERE status = 'running' ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return collectInstances(rows)
}

func (s *Store) ListAllInstances() ([]Instance, error) {
	rows, err := s.db.Query(`
SELECT id, user_id, challenge_id, flag_index, container_id, container_name, host_port,
  connection_type, status, created_at, expires_at, dynamic_flag, flag,
  submitted_flags, attempt_counts, username, password
FROM instances ORDER BY created_at ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return collectInstances(rows)
}

func (s *Store) DeleteInstance(id string) error {
	_, err := s.db.Exec(`DELETE FROM instances WHERE id = ?`, id)
	return err
}

func nullStr(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func scanInstance(row *sql.Row) (*Instance, error) {
	var inst Instance
	var containerID, containerName, dynamicFlag, flag, username, password sql.NullString
	var hostPort sql.NullInt64
	var created string
	var expires sql.NullString
	err := row.Scan(
		&inst.ID, &inst.UserID, &inst.ChallengeID, &inst.FlagIndex,
		&containerID, &containerName, &hostPort, &inst.ConnectionType, &inst.Status,
		&created, &expires, &dynamicFlag, &flag, &inst.SubmittedFlags, &inst.AttemptCounts,
		&username, &password,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	fillInstance(&inst, containerID, containerName, hostPort, created, expires, dynamicFlag, flag, username, password)
	return &inst, nil
}

func collectInstances(rows *sql.Rows) ([]Instance, error) {
	var out []Instance
	for rows.Next() {
		var inst Instance
		var containerID, containerName, dynamicFlag, flag, username, password sql.NullString
		var hostPort sql.NullInt64
		var created string
		var expires sql.NullString
		if err := rows.Scan(
			&inst.ID, &inst.UserID, &inst.ChallengeID, &inst.FlagIndex,
			&containerID, &containerName, &hostPort, &inst.ConnectionType, &inst.Status,
			&created, &expires, &dynamicFlag, &flag, &inst.SubmittedFlags, &inst.AttemptCounts,
			&username, &password,
		); err != nil {
			return nil, err
		}
		fillInstance(&inst, containerID, containerName, hostPort, created, expires, dynamicFlag, flag, username, password)
		out = append(out, inst)
	}
	return out, rows.Err()
}

func fillInstance(
	inst *Instance,
	containerID, containerName sql.NullString,
	hostPort sql.NullInt64,
	created string,
	expires sql.NullString,
	dynamicFlag, flag, username, password sql.NullString,
) {
	inst.ContainerID = containerID.String
	inst.ContainerName = containerName.String
	if hostPort.Valid {
		p := int(hostPort.Int64)
		inst.HostPort = &p
	}
	inst.CreatedAt, _ = time.Parse(time.RFC3339Nano, created)
	if expires.Valid {
		t, err := time.Parse(time.RFC3339Nano, expires.String)
		if err == nil {
			inst.ExpiresAt = &t
		}
	}
	inst.DynamicFlag = dynamicFlag.String
	inst.Flag = flag.String
	inst.Username = username.String
	inst.Password = password.String
}
