import { useCallback, useEffect, useRef, useState } from "react";
import { inspectGitRepository } from "../../../commands/gitCommands";
import { workspaceStore } from "../../../store/workspaceStore";
import type { WorkspaceItem } from "../../../store/types";

type UseWorkspaceInfoHoverInput = {
  workspaces: WorkspaceItem[];
  displayWorkspaceIdByProjectId: Record<string, string>;
  closeDelayMs?: number;
};

/** Manages workspace hover popover lifecycle and branch preview loading. */
export function useWorkspaceInfoHover({
  workspaces,
  displayWorkspaceIdByProjectId,
  closeDelayMs = 120,
}: UseWorkspaceInfoHoverInput) {
  const [workspaceInfoAnchorEl, setWorkspaceInfoAnchorEl] = useState<HTMLElement | null>(null);
  const [hoveredWorkspaceId, setHoveredWorkspaceId] = useState("");
  const [hoveredWorkspaceCurrentBranch, setHoveredWorkspaceCurrentBranch] = useState("");
  const workspaceInfoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearWorkspaceInfoCloseTimer = useCallback(() => {
    if (!workspaceInfoCloseTimerRef.current) {
      return;
    }

    clearTimeout(workspaceInfoCloseTimerRef.current);
    workspaceInfoCloseTimerRef.current = null;
  }, []);

  const scheduleWorkspaceInfoClose = useCallback(() => {
    clearWorkspaceInfoCloseTimer();
    workspaceInfoCloseTimerRef.current = setTimeout(() => {
      setHoveredWorkspaceId("");
      setHoveredWorkspaceCurrentBranch("");
      setWorkspaceInfoAnchorEl(null);
      workspaceInfoCloseTimerRef.current = null;
    }, closeDelayMs);
  }, [clearWorkspaceInfoCloseTimer, closeDelayMs]);

  const handleWorkspaceInfoMouseEnter = useCallback(
    (workspaceId: string, anchorEl: HTMLElement) => {
      clearWorkspaceInfoCloseTimer();
      setHoveredWorkspaceId(workspaceId);
      setWorkspaceInfoAnchorEl(anchorEl);
    },
    [clearWorkspaceInfoCloseTimer],
  );

  const handleWorkspaceInfoMouseLeave = useCallback(() => {
    scheduleWorkspaceInfoClose();
  }, [scheduleWorkspaceInfoClose]);

  const handleWorkspaceInfoPopoverMouseEnter = useCallback(() => {
    clearWorkspaceInfoCloseTimer();
  }, [clearWorkspaceInfoCloseTimer]);

  const handleWorkspaceInfoPopoverMouseLeave = useCallback(() => {
    scheduleWorkspaceInfoClose();
  }, [scheduleWorkspaceInfoClose]);

  useEffect(() => {
    return () => {
      clearWorkspaceInfoCloseTimer();
    };
  }, [clearWorkspaceInfoCloseTimer]);

  // Show cached branch immediately; fetch+cache on miss.
  // Writing to store cache lets gitChanged events update the branch without a re-hover.
  useEffect(() => {
    if (!hoveredWorkspaceId) {
      setHoveredWorkspaceCurrentBranch("");
      return;
    }

    const workspace = workspaces.find((ws) => ws.id === hoveredWorkspaceId);
    if (!workspace?.worktreePath?.trim()) {
      setHoveredWorkspaceCurrentBranch("");
      return;
    }

    // Serve from cache if available.
    const cached = workspaceStore.getState().currentBranchByWorkspaceId[hoveredWorkspaceId];
    if (cached) {
      setHoveredWorkspaceCurrentBranch(cached);
      return;
    }

    let cancelled = false;
    inspectGitRepository({ workspaceId: hoveredWorkspaceId })
      .then((result) => {
        if (!cancelled) {
          const branch = result.currentBranch ?? "";
          setHoveredWorkspaceCurrentBranch(branch);
          if (branch) {
            workspaceStore.getState().setWorkspaceCurrentBranch(hoveredWorkspaceId, branch);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHoveredWorkspaceCurrentBranch("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hoveredWorkspaceId, workspaces]);

  const hoveredWorkspace = workspaces.find((workspace) => workspace.id === hoveredWorkspaceId);
  const hoveredWorkspacePullRequest = workspaceStore((state) => state.pullRequestByWorkspaceId?.[hoveredWorkspaceId]);
  const hoveredWorkspaceLatestPullRequest = workspaceStore((state) => state.latestPullRequestByWorkspaceId?.[hoveredWorkspaceId]);
  const isHoveredWorkspacePrimary = Boolean(
    hoveredWorkspace &&
      (hoveredWorkspace.kind === "local" || displayWorkspaceIdByProjectId[hoveredWorkspace.repoId] === hoveredWorkspace.id),
  );
  const isWorkspaceInfoOpen = Boolean(workspaceInfoAnchorEl) && Boolean(hoveredWorkspace);

  return {
    workspaceInfoAnchorEl,
    hoveredWorkspace,
    hoveredWorkspaceCurrentBranch,
    hoveredWorkspacePullRequest,
    hoveredWorkspaceLatestPullRequest,
    isHoveredWorkspacePrimary,
    isWorkspaceInfoOpen,
    handleWorkspaceInfoMouseEnter,
    handleWorkspaceInfoMouseLeave,
    handleWorkspaceInfoPopoverMouseEnter,
    handleWorkspaceInfoPopoverMouseLeave,
  };
}
