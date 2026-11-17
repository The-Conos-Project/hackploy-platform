package store

import (
	"database/sql"
	"fmt"
	"time"
)

type Competition struct {
	ID           string     `json:"id"`
	Name         string     `json:"name"`
	JoinCode     string     `json:"join_code"`
	MaxTeams     int        `json:"max_teams"`
	JoinClosesAt *time.Time `json:"join_closes_at,omitempty"`
	StartsAt     *time.Time `json:"starts_at,omitempty"`
	EndsAt       *time.Time `json:"ends_at,omitempty"`
	DurationMin  int        `json:"duration_min"`
	Status       string     `json:"status"` // draft|open|live|ended
	CreatedAt    time.Time  `json:"created_at"`
}

type CompetitionChallenge struct {
	CompetitionID string `json:"competition_id"`
	ChallengeID   string `json:"challenge_id"`
	Points        int    `json:"points"`
}

type Team struct {
	ID            string    `json:"id"`
	CompetitionID string    `json:"competition_id"`
	Name          string    `json:"name"`
	JoinCode      string    `json:"join_code"`
	CaptainUserID string    `json:"captain_user_id"`
	CreatedAt     time.Time `json:"created_at"`
}

type TeamMember struct {
	TeamID string `json:"team_id"`
	UserID string `json:"user_id"`
}

type TeamSolve struct {
	TeamID      string    `json:"team_id"`
	ChallengeID string    `json:"challenge_id"`
	Flag        string    `json:"flag"`
	SolvedBy    string    `json:"solved_by"`
	SolvedAt    time.Time `json:"solved_at"`
}

type CompetitionEvent struct {
	ID            string    `json:"id"`
	CompetitionID string    `json:"competition_id"`
	TeamID        string    `json:"team_id"`
	PointsTotal   int       `json:"points_total"`
	At            time.Time `json:"at"`
}

type CompetitionAward struct {
	ID            string    `json:"id"`
	CompetitionID string    `json:"competition_id"`
	UserID        string    `json:"user_id"`
	Kind          string    `json:"kind"`
	Label         string    `json:"label"`
	CreatedAt     time.Time `json:"created_at"`
}

func parseNullTime(ns sql.NullString) *time.Time {
	if !ns.Valid || ns.String == "" {
		return nil
	}
	t, err := time.Parse(time.RFC3339Nano, ns.String)
	if err != nil {
		t, err = time.Parse(time.RFC3339, ns.String)
	}
	if err != nil {
		return nil
	}
	return &t
}

func formatNullTime(t *time.Time) any {
	if t == nil || t.IsZero() {
		return nil
	}
	return t.UTC().Format(time.RFC3339Nano)
}

func (s *Store) CreateCompetition(c *Competition) error {
	if c.DurationMin <= 0 {
		c.DurationMin = 120
	}
	if c.MaxTeams <= 0 {
		c.MaxTeams = 16
	}
	if c.Status == "" {
		c.Status = "draft"
	}
	if c.CreatedAt.IsZero() {
		c.CreatedAt = time.Now().UTC()
	}
	_, err := s.db.Exec(
		`INSERT INTO competitions (id, name, join_code, max_teams, join_closes_at, starts_at, ends_at, duration_min, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		c.ID, c.Name, c.JoinCode, c.MaxTeams, formatNullTime(c.JoinClosesAt), formatNullTime(c.StartsAt),
		formatNullTime(c.EndsAt), c.DurationMin, c.Status, c.CreatedAt.Format(time.RFC3339Nano),
	)
	return err
}

func (s *Store) UpdateCompetition(c *Competition) error {
	res, err := s.db.Exec(
		`UPDATE competitions SET name = ?, join_code = ?, max_teams = ?, join_closes_at = ?, starts_at = ?, ends_at = ?, duration_min = ?, status = ? WHERE id = ?`,
		c.Name, c.JoinCode, c.MaxTeams, formatNullTime(c.JoinClosesAt), formatNullTime(c.StartsAt),
		formatNullTime(c.EndsAt), c.DurationMin, c.Status, c.ID,
	)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("competition not found")
	}
	return nil
}

func (s *Store) GetCompetition(id string) (*Competition, error) {
	row := s.db.QueryRow(
		`SELECT id, name, join_code, max_teams, join_closes_at, starts_at, ends_at, duration_min, status, created_at FROM competitions WHERE id = ?`, id,
	)
	return scanCompetition(row)
}

func (s *Store) GetCompetitionByJoinCode(code string) (*Competition, error) {
	row := s.db.QueryRow(
		`SELECT id, name, join_code, max_teams, join_closes_at, starts_at, ends_at, duration_min, status, created_at FROM competitions WHERE join_code = ?`, code,
	)
	return scanCompetition(row)
}

func (s *Store) ListCompetitions() ([]Competition, error) {
	rows, err := s.db.Query(
		`SELECT id, name, join_code, max_teams, join_closes_at, starts_at, ends_at, duration_min, status, created_at FROM competitions ORDER BY created_at DESC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Competition
	for rows.Next() {
		c, err := scanCompetitionRows(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *c)
	}
	return out, rows.Err()
}

func (s *Store) DeleteCompetition(id string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	teamRows, err := tx.Query(`SELECT id FROM teams WHERE competition_id = ?`, id)
	if err != nil {
		return err
	}
	var teamIDs []string
	for teamRows.Next() {
		var tid string
		if err := teamRows.Scan(&tid); err != nil {
			teamRows.Close()
			return err
		}
		teamIDs = append(teamIDs, tid)
	}
	teamRows.Close()
	for _, tid := range teamIDs {
		if _, err := tx.Exec(`DELETE FROM team_members WHERE team_id = ?`, tid); err != nil {
			return err
		}
		if _, err := tx.Exec(`DELETE FROM team_solves WHERE team_id = ?`, tid); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(`DELETE FROM teams WHERE competition_id = ?`, id); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM competition_challenges WHERE competition_id = ?`, id); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM competition_events WHERE competition_id = ?`, id); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM competition_awards WHERE competition_id = ?`, id); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM competitions WHERE id = ?`, id); err != nil {
		return err
	}
	return tx.Commit()
}

func scanCompetition(row *sql.Row) (*Competition, error) {
	var c Competition
	var joinClose, starts, ends, created sql.NullString
	err := row.Scan(&c.ID, &c.Name, &c.JoinCode, &c.MaxTeams, &joinClose, &starts, &ends, &c.DurationMin, &c.Status, &created)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	c.JoinClosesAt = parseNullTime(joinClose)
	c.StartsAt = parseNullTime(starts)
	c.EndsAt = parseNullTime(ends)
	if created.Valid {
		c.CreatedAt, _ = time.Parse(time.RFC3339Nano, created.String)
	}
	return &c, nil
}

func scanCompetitionRows(rows *sql.Rows) (*Competition, error) {
	var c Competition
	var joinClose, starts, ends, created sql.NullString
	if err := rows.Scan(&c.ID, &c.Name, &c.JoinCode, &c.MaxTeams, &joinClose, &starts, &ends, &c.DurationMin, &c.Status, &created); err != nil {
		return nil, err
	}
	c.JoinClosesAt = parseNullTime(joinClose)
	c.StartsAt = parseNullTime(starts)
	c.EndsAt = parseNullTime(ends)
	if created.Valid {
		c.CreatedAt, _ = time.Parse(time.RFC3339Nano, created.String)
	}
	return &c, nil
}

func (s *Store) SetCompetitionChallenges(competitionID string, rows []CompetitionChallenge) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.Exec(`DELETE FROM competition_challenges WHERE competition_id = ?`, competitionID); err != nil {
		return err
	}
	for _, r := range rows {
		if _, err := tx.Exec(
			`INSERT INTO competition_challenges (competition_id, challenge_id, points) VALUES (?, ?, ?)`,
			competitionID, r.ChallengeID, r.Points,
		); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) ListCompetitionChallenges(competitionID string) ([]CompetitionChallenge, error) {
	rows, err := s.db.Query(
		`SELECT competition_id, challenge_id, points FROM competition_challenges WHERE competition_id = ?`, competitionID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []CompetitionChallenge
	for rows.Next() {
		var r CompetitionChallenge
		if err := rows.Scan(&r.CompetitionID, &r.ChallengeID, &r.Points); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *Store) CreateTeam(t *Team) error {
	if t.CreatedAt.IsZero() {
		t.CreatedAt = time.Now().UTC()
	}
	_, err := s.db.Exec(
		`INSERT INTO teams (id, competition_id, name, join_code, captain_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		t.ID, t.CompetitionID, t.Name, t.JoinCode, t.CaptainUserID, t.CreatedAt.Format(time.RFC3339Nano),
	)
	return err
}

func (s *Store) GetTeam(id string) (*Team, error) {
	row := s.db.QueryRow(
		`SELECT id, competition_id, name, join_code, captain_user_id, created_at FROM teams WHERE id = ?`, id,
	)
	return scanTeam(row)
}

func (s *Store) GetTeamByJoinCode(code string) (*Team, error) {
	row := s.db.QueryRow(
		`SELECT id, competition_id, name, join_code, captain_user_id, created_at FROM teams WHERE join_code = ?`, code,
	)
	return scanTeam(row)
}

func (s *Store) ListTeams(competitionID string) ([]Team, error) {
	rows, err := s.db.Query(
		`SELECT id, competition_id, name, join_code, captain_user_id, created_at FROM teams WHERE competition_id = ? ORDER BY created_at ASC`,
		competitionID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Team
	for rows.Next() {
		t, err := scanTeamRows(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *t)
	}
	return out, rows.Err()
}

func scanTeam(row *sql.Row) (*Team, error) {
	var t Team
	var created string
	err := row.Scan(&t.ID, &t.CompetitionID, &t.Name, &t.JoinCode, &t.CaptainUserID, &created)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	t.CreatedAt, _ = time.Parse(time.RFC3339Nano, created)
	return &t, nil
}

func scanTeamRows(rows *sql.Rows) (*Team, error) {
	var t Team
	var created string
	if err := rows.Scan(&t.ID, &t.CompetitionID, &t.Name, &t.JoinCode, &t.CaptainUserID, &created); err != nil {
		return nil, err
	}
	t.CreatedAt, _ = time.Parse(time.RFC3339Nano, created)
	return &t, nil
}

func (s *Store) AddTeamMember(teamID, userID string) error {
	_, err := s.db.Exec(`INSERT OR IGNORE INTO team_members (team_id, user_id) VALUES (?, ?)`, teamID, userID)
	return err
}

func (s *Store) ListTeamMembers(teamID string) ([]string, error) {
	rows, err := s.db.Query(`SELECT user_id FROM team_members WHERE team_id = ?`, teamID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var uid string
		if err := rows.Scan(&uid); err != nil {
			return nil, err
		}
		out = append(out, uid)
	}
	return out, rows.Err()
}

func (s *Store) FindUserTeam(competitionID, userID string) (*Team, error) {
	row := s.db.QueryRow(
		`SELECT t.id, t.competition_id, t.name, t.join_code, t.captain_user_id, t.created_at
     FROM teams t JOIN team_members m ON m.team_id = t.id
     WHERE t.competition_id = ? AND m.user_id = ?`,
		competitionID, userID,
	)
	return scanTeam(row)
}

func (s *Store) UpsertTeamSolve(solve *TeamSolve) error {
	if solve.SolvedAt.IsZero() {
		solve.SolvedAt = time.Now().UTC()
	}
	_, err := s.db.Exec(
		`INSERT INTO team_solves (team_id, challenge_id, flag, solved_by, solved_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(team_id, challenge_id) DO NOTHING`,
		solve.TeamID, solve.ChallengeID, solve.Flag, solve.SolvedBy, solve.SolvedAt.Format(time.RFC3339Nano),
	)
	return err
}

func (s *Store) ListTeamSolves(teamID string) ([]TeamSolve, error) {
	rows, err := s.db.Query(
		`SELECT team_id, challenge_id, flag, solved_by, solved_at FROM team_solves WHERE team_id = ?`, teamID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []TeamSolve
	for rows.Next() {
		var sol TeamSolve
		var at string
		if err := rows.Scan(&sol.TeamID, &sol.ChallengeID, &sol.Flag, &sol.SolvedBy, &at); err != nil {
			return nil, err
		}
		sol.SolvedAt, _ = time.Parse(time.RFC3339Nano, at)
		out = append(out, sol)
	}
	return out, rows.Err()
}

func (s *Store) ListCompetitionSolves(competitionID string) ([]TeamSolve, error) {
	rows, err := s.db.Query(
		`SELECT s.team_id, s.challenge_id, s.flag, s.solved_by, s.solved_at
     FROM team_solves s JOIN teams t ON t.id = s.team_id WHERE t.competition_id = ?`,
		competitionID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []TeamSolve
	for rows.Next() {
		var sol TeamSolve
		var at string
		if err := rows.Scan(&sol.TeamID, &sol.ChallengeID, &sol.Flag, &sol.SolvedBy, &at); err != nil {
			return nil, err
		}
		sol.SolvedAt, _ = time.Parse(time.RFC3339Nano, at)
		out = append(out, sol)
	}
	return out, rows.Err()
}

func (s *Store) AddCompetitionEvent(ev *CompetitionEvent) error {
	if ev.At.IsZero() {
		ev.At = time.Now().UTC()
	}
	_, err := s.db.Exec(
		`INSERT INTO competition_events (id, competition_id, team_id, points_total, at) VALUES (?, ?, ?, ?, ?)`,
		ev.ID, ev.CompetitionID, ev.TeamID, ev.PointsTotal, ev.At.Format(time.RFC3339Nano),
	)
	return err
}

func (s *Store) ListCompetitionEvents(competitionID string) ([]CompetitionEvent, error) {
	rows, err := s.db.Query(
		`SELECT id, competition_id, team_id, points_total, at FROM competition_events WHERE competition_id = ? ORDER BY at ASC`,
		competitionID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []CompetitionEvent
	for rows.Next() {
		var ev CompetitionEvent
		var at string
		if err := rows.Scan(&ev.ID, &ev.CompetitionID, &ev.TeamID, &ev.PointsTotal, &at); err != nil {
			return nil, err
		}
		ev.At, _ = time.Parse(time.RFC3339Nano, at)
		out = append(out, ev)
	}
	return out, rows.Err()
}

func (s *Store) CreateCompetitionAward(a *CompetitionAward) error {
	if a.CreatedAt.IsZero() {
		a.CreatedAt = time.Now().UTC()
	}
	_, err := s.db.Exec(
		`INSERT INTO competition_awards (id, competition_id, user_id, kind, label, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		a.ID, a.CompetitionID, a.UserID, a.Kind, a.Label, a.CreatedAt.Format(time.RFC3339Nano),
	)
	return err
}

func (s *Store) ListCompetitionAwards(competitionID string) ([]CompetitionAward, error) {
	rows, err := s.db.Query(
		`SELECT id, competition_id, user_id, kind, label, created_at FROM competition_awards WHERE competition_id = ?`,
		competitionID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []CompetitionAward
	for rows.Next() {
		var a CompetitionAward
		var created string
		if err := rows.Scan(&a.ID, &a.CompetitionID, &a.UserID, &a.Kind, &a.Label, &created); err != nil {
			return nil, err
		}
		a.CreatedAt, _ = time.Parse(time.RFC3339Nano, created)
		out = append(out, a)
	}
	return out, rows.Err()
}

func (s *Store) ListUserAwards(userID string) ([]CompetitionAward, error) {
	rows, err := s.db.Query(
		`SELECT id, competition_id, user_id, kind, label, created_at FROM competition_awards WHERE user_id = ? ORDER BY created_at DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []CompetitionAward
	for rows.Next() {
		var a CompetitionAward
		var created string
		if err := rows.Scan(&a.ID, &a.CompetitionID, &a.UserID, &a.Kind, &a.Label, &created); err != nil {
			return nil, err
		}
		a.CreatedAt, _ = time.Parse(time.RFC3339Nano, created)
		out = append(out, a)
	}
	return out, rows.Err()
}

func (s *Store) ClearCompetitionAwards(competitionID string) error {
	_, err := s.db.Exec(`DELETE FROM competition_awards WHERE competition_id = ?`, competitionID)
	return err
}
