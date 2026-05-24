//go:build windows

package daemon

import (
	"os"
	"syscall"
)

func sysProcAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{
		CreationFlags: 0x00000008, // DETACHED_PROCESS
	}
}

func IsProcessRunning(pid int) bool {
	if pid <= 0 {
		return false
	}

	p, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	defer p.Release()

	// On Windows, FindProcess always succeeds; signal 0 check not supported.
	// Use a zero signal to test if the process handle is valid.
	return p.Signal(syscall.Signal(0)) == nil
}
