//go:build !windows

package modellist

import (
	"os"
	"os/exec"
	"syscall"

	"yishan/apps/cli/internal/runtime/shellenv"
)

// isolateCmd prevents the subprocess from triggering SIGHUP delivery to the
// daemon. Bun-based CLIs (e.g. opencode) call setsid() on startup; when they
// do so as a direct child of the daemon process, the kernel may deliver SIGHUP
// to the daemon. Setting Setsid:true here puts the child in its own session
// before it can attempt that, eliminating the signal entirely.
//
// It also enriches the subprocess PATH using ResolveEnvWithUserPath so that
// CLI tools installed in user-local directories (e.g. ~/.opencode/bin,
// ~/.local/bin, ~/.yishan/bin) are findable even when the daemon was launched
// from a GUI context (Electron) that has a minimal system PATH.
func isolateCmd(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	cmd.Env = shellenv.ResolveEnvWithUserPath(os.Environ(), os.Getenv("SHELL"))
}
