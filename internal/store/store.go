package store

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

type Store struct {
	db *sql.DB
}

func Open(dataDir string) (*Store, error) {
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return nil, err
	}
	dsn := filepath.Join(dataDir, "hackploy.db")
	db, err := sql.Open("sqlite", dsn+"?_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)")
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) DBPath(dataDir string) string {
	return filepath.Join(dataDir, "hackploy.db")
}

func (s *Store) migrate() error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  handle TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
)`,
		`CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
)`,
		`CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  join_code TEXT NOT NULL UNIQUE,
  challenge_ids TEXT NOT NULL DEFAULT '[]',
  member_ids TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
)`,
		`CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT,
  description TEXT,
  image_tag TEXT,
  flags TEXT NOT NULL DEFAULT '[]',
  credentials TEXT NOT NULL DEFAULT '{}',
  build_status TEXT NOT NULL DEFAULT 'pending',
  source_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`,
		`CREATE TABLE IF NOT EXISTS instances (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  challenge_id TEXT NOT NULL,
  flag_index INTEGER NOT NULL DEFAULT 0,
  container_id TEXT,
  container_name TEXT,
  host_port INTEGER,
  connection_type TEXT NOT NULL DEFAULT 'ssh',
  status TEXT NOT NULL DEFAULT 'stopped',
  created_at TEXT NOT NULL,
  expires_at TEXT,
  dynamic_flag TEXT,
  flag TEXT,
  submitted_flags TEXT NOT NULL DEFAULT '[]',
  attempt_counts TEXT NOT NULL DEFAULT '{}',
  username TEXT,
  password TEXT
)`,
		`CREATE INDEX IF NOT EXISTS idx_instances_user ON instances(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_instances_challenge ON instances(challenge_id)`,
		`CREATE INDEX IF NOT EXISTS idx_instances_status ON instances(status)`,
	}
	for _, q := range stmts {
		if _, err := s.db.Exec(q); err != nil {
			return fmt.Errorf("migrate: %w\nquery: %s", err, q)
		}
	}
	// Additive column upgrades (no wipe) for older DBs
	if err := s.ensureColumn("users", "handle", "TEXT NOT NULL DEFAULT ''"); err != nil {
		return err
	}
	if _, err := s.db.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_handle ON users(handle) WHERE handle != ''`); err != nil {
		return fmt.Errorf("migrate handle index: %w", err)
	}
	if err := s.ensureColumn("challenges", "source_path", "TEXT"); err != nil {
		return err
	}
	if err := s.ensureColumn("challenges", "created_at", "TEXT NOT NULL DEFAULT ''"); err != nil {
		return err
	}
	if err := s.ensureColumn("challenges", "updated_at", "TEXT NOT NULL DEFAULT ''"); err != nil {
		return err
	}
	if err := s.ensureColumn("instances", "flag_index", "INTEGER NOT NULL DEFAULT 0"); err != nil {
		return err
	}
	if err := s.ensureColumn("instances", "submitted_flags", "TEXT NOT NULL DEFAULT '[]'"); err != nil {
		return err
	}
	if err := s.ensureColumn("instances", "attempt_counts", "TEXT NOT NULL DEFAULT '{}'"); err != nil {
		return err
	}
	return nil
}

func (s *Store) ensureColumn(table, column, definition string) error {
	rows, err := s.db.Query(fmt.Sprintf(`PRAGMA table_info(%s)`, table))
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var cid int
		var name, ctype string
		var notnull, pk int
		var dflt sql.NullString
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pk); err != nil {
			return err
		}
		if name == column {
			return nil
		}
	}
	_, err = s.db.Exec(fmt.Sprintf(`ALTER TABLE %s ADD COLUMN %s %s`, table, column, definition))
	return err
}
