//go:build windows

package modellist

import (
	"os"
	"os/exec"

	"yishan/apps/cli/internal/runtime/shellenv"
)

// isolateCmd is a no-op on Windows for SIGHUP (does not exist), but still
// enriches the subprocess PATH so CLI tools in user-local directories are
// findable when the daemon was launched from a GUI context with a minimal PATH.
func isolateCmd(cmd *exec.Cmd) {
	cmd.Env = shellenv.ResolveEnvWithUserPath(os.Environ(), "")
}
