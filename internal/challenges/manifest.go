package challenges

import (
	"encoding/json"
	"fmt"
	"os"
	"regexp"
)

var nameRe = regexp.MustCompile(`^[a-z0-9][a-z0-9_.-]{0,62}$`)
var flagRe = regexp.MustCompile(`^CN\{.+\}$`)

type Manifest struct {
	Name         string           `json:"name"`
	DisplayName  string           `json:"display_name"`
	Description  string           `json:"description"`
	Credentials  map[string]any   `json:"credentials"`
	Flags        []FlagSpec       `json:"flags"`
	Challenges   []StationSpec    `json:"challenges"`
}

type StationSpec struct {
	Name        string     `json:"name"`
	DisplayName string     `json:"display_name"`
	Description string     `json:"description"`
	Difficulty  string     `json:"difficulty"`
	Flag        string     `json:"flag"`
	Flags       []FlagSpec `json:"flags"`
	Points      int        `json:"points"`
}

type FlagSpec struct {
	Flag         string   `json:"flag"`
	Points       int      `json:"points"`
	MaxAttempts  int      `json:"max_attempts"`
	Description  string   `json:"description"`
	Hints        []string `json:"hints"`
}

type NormalizedStation struct {
	Name        string
	DisplayName string
	Description string
	Flags       []FlagSpec
}

func LoadManifest(path string) (*Manifest, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var m Manifest
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil, fmt.Errorf("hackploy.json: %w", err)
	}
	if err := m.Validate(); err != nil {
		return nil, err
	}
	return &m, nil
}

func (m *Manifest) Validate() error {
	if !nameRe.MatchString(m.Name) {
		return fmt.Errorf("invalid package name %q", m.Name)
	}
	if m.DisplayName == "" {
		m.DisplayName = m.Name
	}
	for _, st := range m.Stations() {
		if !nameRe.MatchString(st.Name) {
			return fmt.Errorf("invalid station name %q", st.Name)
		}
		for _, f := range st.Flags {
			if !flagRe.MatchString(f.Flag) {
				return fmt.Errorf("flag must use CN{...} format: %q", f.Flag)
			}
		}
	}
	return nil
}

func (m *Manifest) Stations() []NormalizedStation {
	if len(m.Challenges) > 0 {
		out := make([]NormalizedStation, 0, len(m.Challenges))
		for _, ch := range m.Challenges {
			flags := ch.Flags
			if ch.Flag != "" {
				flags = append([]FlagSpec{{
					Flag:        ch.Flag,
					Points:      ch.Points,
					Description: ch.Description,
				}}, flags...)
			}
			if len(flags) == 0 {
				continue
			}
			dn := ch.DisplayName
			if dn == "" {
				dn = ch.Name
			}
			out = append(out, NormalizedStation{
				Name:        ch.Name,
				DisplayName: dn,
				Description: ch.Description,
				Flags:       flags,
			})
		}
		return out
	}
	return []NormalizedStation{{
		Name:        m.Name,
		DisplayName: m.DisplayName,
		Description: m.Description,
		Flags:       m.Flags,
	}}
}
