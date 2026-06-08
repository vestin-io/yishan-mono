//go:build !windows

package modellist

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"

	"yishan/apps/cli/internal/runtime/shellenv"
)

// enrichedPath is the PATH value computed once at package init by merging the
// process PATH with known user-local bin directories. Using init() avoids
// spawning a login shell on every subprocess invocation.
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

// isolateCmd prevents the subprocess from triggering SIGHUP delivery to the
// daemon. Bun-based CLIs (e.g. opencode) call setsid() on startup; when they
// do so as a direct child of the daemon process, the kernel may deliver SIGHUP
// to the daemon. Setting Setsid:true here puts the child in its own session
// before it can attempt that, eliminating the signal entirely.
//
// It also sets an enriched PATH so CLI tools in user-local directories
// (e.g. ~/.opencode/bin, ~/.local/bin, ~/.yishan/bin) are findable even when
// the daemon was launched from a GUI context with a minimal system PATH.
// The enriched PATH is computed once at init time to avoid spawning a login
// shell on every invocation.
func isolateCmd(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
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
