import { access, lstat, mkdir, readlink, rename, rm, unlink, writeFile } from "node:fs/promises";
import { constants as fsConstants, existsSync } from "node:fs";
import { dirname, delimiter, resolve } from "node:path";
import { homedir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type DesktopCliInstallStatus = {
  isAvailableInPath: boolean;
  resolvedPath?: string;
  isManagedInstall: boolean;
  installPath: string;
  bundledCliPath: string;
};

function getBundledCliPath(): string {
  const binaryName = process.platform === "win32" ? "yishan.exe" : "yishan";
  return resolve(process.resourcesPath, binaryName);
}

function getInstallPath(): string {
  if (process.platform === "win32") {
    return resolve(homedir(), "AppData", "Local", "Yishan", "bin", "yishan.exe");
  }

  return resolve(homedir(), ".local", "bin", "yishan");
}

function resolvePathCommandTarget(): string | undefined {
  const paths = (process.env.PATH || "").split(delimiter).map((item) => item.trim());
  for (const pathEntry of paths) {
    if (!pathEntry) {
      continue;
    }
    const target = resolve(pathEntry, process.platform === "win32" ? "yishan.exe" : "yishan");
    if (existsSync(target)) {
      return target;
    }
  }
  return undefined;
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns true if the path is a symlink pointing into the app bundle
 * (the old managed-install approach).
 */
async function isOldManagedSymlink(path: string): Promise<boolean> {
  try {
    const stats = await lstat(path);
    if (!stats.isSymbolicLink()) {
      return false;
    }
    const linkedTarget = await readlink(path);
    const resolvedTarget = resolve(dirname(path), linkedTarget);
    const bundledCliPath = getBundledCliPath();
    // Old approach symlinked to the bundled CLI inside the app bundle.
    return resolvedTarget === bundledCliPath || resolvedTarget.includes(".app/Contents/");
  } catch {
    return false;
  }
}

/**
 * Cleans up the old symlink-based managed install if present.
 */
async function cleanupOldSymlink(installPath: string): Promise<void> {
  if (await isOldManagedSymlink(installPath)) {
    await unlink(installPath);
  }
}

/**
 * Searches PATH and common install locations for an existing `yishan` binary.
 * Skips the bundled binary inside the app bundle.
 */
function resolveExistingCli(): string | undefined {
  const binaryName = process.platform === "win32" ? "yishan.exe" : "yishan";
  const bundledCliPath = getBundledCliPath();

  // Check PATH entries.
  const paths = (process.env.PATH || "").split(delimiter).map((item) => item.trim());
  for (const dir of paths) {
    if (!dir) continue;
    const candidate = resolve(dir, binaryName);
    if (candidate === bundledCliPath) continue;
    if (existsSync(candidate)) return candidate;
  }

  // Check common locations that may not be in Electron's restricted PATH.
  const home = process.env.HOME || process.env.USERPROFILE || homedir();
  const commonPaths =
    process.platform === "win32"
      ? [
          resolve(home, "AppData", "Local", "Yishan", "bin", binaryName),
          resolve(home, ".local", "bin", binaryName),
        ]
      : [
          resolve(home, ".local", "bin", binaryName),
          "/usr/local/bin/" + binaryName,
          "/opt/homebrew/bin/" + binaryName,
        ];

  for (const candidate of commonPaths) {
    if (candidate === bundledCliPath) continue;
    if (existsSync(candidate)) return candidate;
  }

  return undefined;
}

export async function getDesktopCliInstallStatus(): Promise<DesktopCliInstallStatus> {
  const bundledCliPath = getBundledCliPath();
  const installPath = getInstallPath();
  const resolvedPath = resolvePathCommandTarget();

  // Check if we have a real binary (not a symlink to the bundle) at the install path.
  let isManagedInstall = false;
  try {
    const stats = await lstat(installPath);
    // A regular file at the install path means we (or the install script) put it there.
    // A symlink to the bundle is the old approach and should be cleaned up.
    isManagedInstall = stats.isFile() && !stats.isSymbolicLink();
  } catch {
    isManagedInstall = false;
  }

  const installPathExecutable = await isExecutable(installPath);
  const isAvailableInPath = (resolvedPath ? await isExecutable(resolvedPath) : false) || installPathExecutable;
  const effectiveResolvedPath = resolvedPath ?? (installPathExecutable ? installPath : undefined);

  return {
    isAvailableInPath,
    resolvedPath: effectiveResolvedPath,
    isManagedInstall,
    installPath,
    bundledCliPath,
  };
}

export async function installDesktopCli(): Promise<DesktopCliInstallStatus> {
  const installPath = getInstallPath();

  if (process.platform === "win32") {
    throw new Error("Desktop-assisted CLI install is not supported on Windows yet.");
  }

  // Clean up old symlink-based install if present.
  await cleanupOldSymlink(installPath);

  // Check if a CLI binary is already installed anywhere (PATH or common locations).
  const existingCli = resolveExistingCli();
  if (existingCli) {
    // Already installed — try self-update first. If the installed version
    // doesn't have the self-update command, fall through to the install script.
    try {
      await execFileAsync(existingCli, ["self-update", "--force"], { timeout: 60_000 });
      return await getDesktopCliInstallStatus();
    } catch {
      // self-update not available (old version) or failed — fall through
      // to reinstall via the install script.
    }
  }

  // Not installed, or self-update unavailable — use the install script.
  // If we found an existing CLI, install to the same directory to replace it.
  const targetDir = existingCli ? dirname(existingCli) : dirname(installPath);
  const installScript = `
    set -eu
    curl -fsSL https://raw.githubusercontent.com/yishan-io/yishan-mono/main/install.sh | sh -s -- --force --bin-dir "${targetDir}"
  `.trim();

  try {
    await execFileAsync("sh", ["-c", installScript], { timeout: 120_000 });
  } catch (error) {
    throw new Error(
      `Install script failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }

  return await getDesktopCliInstallStatus();
}

export async function uninstallDesktopCli(): Promise<DesktopCliInstallStatus> {
  const installPath = getInstallPath();

  if (process.platform === "win32") {
    throw new Error("Desktop-assisted CLI uninstall is not supported on Windows yet.");
  }

  try {
    // Remove whether it's a real binary or old symlink.
    await rm(installPath, { force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  return await getDesktopCliInstallStatus();
}
