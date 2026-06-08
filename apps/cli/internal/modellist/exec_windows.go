//go:build windows

package modellist

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"yishan/apps/cli/internal/runtime/shellenv"
)

var enrichedPath string

func init() {
	dirs := shellenv.CommonUserBinDirectories()
	existing := os.Getenv("PATH")
	parts := strings.Split(existing, string(os.PathListSeparator))
	seen := make(map[string]bool, len(parts))
	for _, p := range parts {
		seen[p] = true
	}
	for _, d := range dirs {
		d = filepath.Clean(d)
		if !seen[d] {
			parts = append([]string{d}, parts...)
			seen[d] = true
		}
	}
	enrichedPath = strings.Join(parts, string(os.PathListSeparator))
}

// isolateCmd enriches the subprocess PATH on Windows so CLI tools in
// user-local directories are findable when the daemon has a minimal PATH.
func isolateCmd(cmd *exec.Cmd) {
	env := os.Environ()
	enriched := make([]string, 0, len(env))
	for _, e := range env {
		if strings.HasPrefix(e, "PATH=") {
			enriched = append(enriched, "PATH="+enrichedPath)
		} else {
			enriched = append(enriched, e)
		}
	}
	cmd.Env = enriched
}
