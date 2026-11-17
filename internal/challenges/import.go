package challenges

import (
	"archive/tar"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/The-Conos-Project/hackploy-platform/internal/store"
	"github.com/google/uuid"
)

const maxArchiveBytes = 100 << 20
const maxMembers = 5000

type ImportResult struct {
	SetName      string   `json:"set_name"`
	ImageTag     string   `json:"image_tag"`
	SourceDir    string   `json:"source_dir"`
	ChallengeIDs []string `json:"challenge_ids"`
}

func ImportTarGz(st *store.Store, dataDir string, r io.Reader) (*ImportResult, error) {
	limited := io.LimitReader(r, maxArchiveBytes+1)
	gz, err := gzip.NewReader(limited)
	if err != nil {
		return nil, fmt.Errorf("gzip: %w", err)
	}
	defer gz.Close()

	tmp, err := os.MkdirTemp(dataDir, "import-*")
	if err != nil {
		return nil, err
	}
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.RemoveAll(tmp)
		}
	}()

	tr := tar.NewReader(gz)
	count := 0
	var total int64
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("tar: %w", err)
		}
		count++
		if count > maxMembers {
			return nil, fmt.Errorf("archive has too many files")
		}
		name := filepath.Clean("/" + hdr.Name)
		name = strings.TrimPrefix(name, "/")
		if name == "" || name == "." {
			continue
		}
		if strings.Contains(name, "..") {
			return nil, fmt.Errorf("unsafe path in archive")
		}
		dest := filepath.Join(tmp, name)
		if !strings.HasPrefix(dest, filepath.Clean(tmp)+string(os.PathSeparator)) && dest != filepath.Clean(tmp) {
			return nil, fmt.Errorf("unsafe path in archive")
		}
		switch hdr.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(dest, 0o755); err != nil {
				return nil, err
			}
		case tar.TypeReg, tar.TypeRegA:
			if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
				return nil, err
			}
			f, err := os.OpenFile(dest, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
			if err != nil {
				return nil, err
			}
			n, err := io.Copy(f, tr)
			_ = f.Close()
			if err != nil {
				return nil, err
			}
			total += n
			if total > maxArchiveBytes {
				return nil, fmt.Errorf("archive exceeds 100 MB")
			}
		default:
			return nil, fmt.Errorf("unsupported tar entry type")
		}
	}

	buildDir, err := findBuildDir(tmp)
	if err != nil {
		return nil, err
	}
	metaPath := filepath.Join(buildDir, "hackploy.json")
	manifest, err := LoadManifest(metaPath)
	if err != nil {
		return nil, err
	}

	setRoot := filepath.Join(dataDir, "challenges", manifest.Name)
	_ = os.RemoveAll(setRoot)
	if err := os.MkdirAll(filepath.Dir(setRoot), 0o755); err != nil {
		return nil, err
	}
	if err := os.Rename(buildDir, setRoot); err != nil {
		// cross-device fallback
		if err := copyDir(buildDir, setRoot); err != nil {
			return nil, err
		}
	}
	cleanup = false
	_ = os.RemoveAll(tmp)

	imageTag := "hackploy-" + manifest.Name
	creds, _ := json.Marshal(manifest.Credentials)
	challenges := manifest.NormalizedChallenges()
	// Replace prior challenges from this set (same image tag / names).
	existing, _ := st.ListChallenges()
	for _, old := range existing {
		if old.ImageTag == imageTag {
			_ = st.DeleteChallenge(old.ID)
			continue
		}
		for _, c := range challenges {
			if old.Name == c.Name {
				_ = st.DeleteChallenge(old.ID)
				break
			}
		}
	}
	var ids []string
	for _, c := range challenges {
		flagsJSON, _ := json.Marshal(c.Flags)
		id := uuid.NewString()[:8]
		ch := &store.Challenge{
			ID:          id,
			Name:        c.Name,
			DisplayName: c.DisplayName,
			Description: c.Description,
			ImageTag:    imageTag,
			Flags:       string(flagsJSON),
			Credentials: string(creds),
			BuildStatus: "pending",
			SourcePath:  setRoot,
		}
		if err := st.UpsertChallenge(ch); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}

	return &ImportResult{
		SetName:      manifest.Name,
		ImageTag:     imageTag,
		SourceDir:    setRoot,
		ChallengeIDs: ids,
	}, nil
}

func findBuildDir(root string) (string, error) {
	if _, err := os.Stat(filepath.Join(root, "Dockerfile")); err == nil {
		if _, err := os.Stat(filepath.Join(root, "hackploy.json")); err == nil {
			return root, nil
		}
	}
	var found []string
	_ = filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		if info.Name() == "Dockerfile" {
			dir := filepath.Dir(path)
			if _, err := os.Stat(filepath.Join(dir, "hackploy.json")); err == nil {
				found = append(found, dir)
			}
		}
		return nil
	})
	if len(found) == 0 {
		return "", fmt.Errorf("archive needs Dockerfile + hackploy.json")
	}
	if len(found) > 1 {
		return "", fmt.Errorf("archive has multiple challenge sets")
	}
	return found[0], nil
}

func copyDir(src, dst string) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, rel)
		if info.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		in, err := os.Open(path)
		if err != nil {
			return err
		}
		defer in.Close()
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, info.Mode())
		if err != nil {
			return err
		}
		_, copyErr := io.Copy(out, in)
		closeErr := out.Close()
		if copyErr != nil {
			return copyErr
		}
		return closeErr
	})
}
