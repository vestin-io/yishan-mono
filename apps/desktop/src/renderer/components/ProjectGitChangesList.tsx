import { Box, ButtonBase, Typography } from "@mui/material";
import { type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent, useState } from "react";
import { LuChevronDown, LuChevronRight, LuMinus, LuPlus } from "react-icons/lu";
import { GitChangesContextMenu, type GitChangesContextMenuState } from "./GitChangesContextMenu";
import { GitChangesFileRow } from "./GitChangesFileRow";
import { GitChangesSectionHeader } from "./GitChangesSectionHeader";

export type ProjectGitChangeKind = "added" | "modified" | "deleted" | "renamed" | "untracked";

export type ProjectGitChangeItem = {
  path: string;
  kind: ProjectGitChangeKind;
  additions: number;
  deletions: number;
};

export type ProjectGitChangesSection = {
  id: string;
  label: string;
  files: ProjectGitChangeItem[];
};

type ProjectGitChangesListProps = {
  sections: ProjectGitChangesSection[];
  readOnly?: boolean;
  onSelectFile?: (file: ProjectGitChangeItem) => void;
  onTrackSection?: (section: ProjectGitChangesSection) => void;
  onRevertSection?: (section: ProjectGitChangesSection) => void;
  onTrackFile?: (file: ProjectGitChangeItem, sectionId: ProjectGitChangesSection["id"]) => void;
  onRevertFile?: (file: ProjectGitChangeItem) => void;
  onMoveFile?: (
    file: ProjectGitChangeItem,
    sourceSectionId: ProjectGitChangesSection["id"],
    targetSectionId: ProjectGitChangesSection["id"],
  ) => void;
  onMoveFiles?: (
    files: ProjectGitChangeItem[],
    sourceSectionId: ProjectGitChangesSection["id"],
    targetSectionId: ProjectGitChangesSection["id"],
  ) => void;
  onCopyFilePath?: (file: ProjectGitChangeItem) => void;
  onCopyRelativeFilePath?: (file: ProjectGitChangeItem) => void;
};

type FolderGroup = {
  folder: string;
  files: ProjectGitChangeItem[];
};

/** Groups changed files by parent folder so list rows stay compact. */
function groupByFolder(files: ProjectGitChangeItem[]): FolderGroup[] {
  const groups = new Map<string, ProjectGitChangeItem[]>();

  for (const file of files) {
    const pathParts = file.path.split("/");
    const folder = pathParts.length > 1 ? pathParts.slice(0, -1).join("/") : ".";
    const current = groups.get(folder) ?? [];
    current.push(file);
    groups.set(folder, current);
  }

  return [...groups.entries()].map(([folder, folderFiles]) => ({
    folder,
    files: folderFiles,
  }));
}

/** Returns whether one drag/drop move between sections maps to a valid git action. */
function canMoveFileBetweenSections(sourceSectionId: string, targetSectionId: string) {
  if (sourceSectionId === targetSectionId) {
    return false;
  }

  if (targetSectionId === "staged") {
    return sourceSectionId !== "staged";
  }

  return sourceSectionId === "staged";
}

/** Builds one stable selection key from section and path values. */
function getFileSelectionKey(sectionId: string, path: string) {
  return `${sectionId}::${path}`;
}

/** Builds one stable collapse key for a folder group inside a section. */
function getFolderCollapseKey(sectionId: string, folder: string) {
  return `${sectionId}::${folder}`;
}

/** Resolves label and icon used for track/unstage actions per section. */
function getTrackActionMeta(sectionId: string) {
  if (sectionId === "staged") {
    return {
      verb: "Unstage",
      FileIcon: LuMinus,
    };
  }

  return {
    verb: "Stage",
    FileIcon: LuPlus,
  };
}

/** Returns whether one section should render revert actions. */
function shouldShowRevertAction(sectionId: string) {
  return sectionId !== "staged";
}

/** Resolves section-specific wording for destructive restore actions. */
function getRestoreActionVerb(sectionId: string) {
  return sectionId === "untracked" ? "Discard" : "Revert";
}

/** Renders grouped git sections and supports selecting one diff row. */
export function ProjectGitChangesList({
  sections,
  readOnly = false,
  onSelectFile,
  onTrackSection,
  onRevertSection,
  onTrackFile,
  onRevertFile,
  onMoveFile,
  onMoveFiles,
  onCopyFilePath,
  onCopyRelativeFilePath,
}: ProjectGitChangesListProps) {
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<Set<string>>(new Set());
  const [contextMenuState, setContextMenuState] = useState<GitChangesContextMenuState | null>(null);
  const [draggedFileState, setDraggedFileState] = useState<{
    files: ProjectGitChangeItem[];
    sectionId: ProjectGitChangesSection["id"];
  } | null>(null);
  const [dragOverSectionId, setDragOverSectionId] = useState<string | null>(null);
  const [selectedFileKeys, setSelectedFileKeys] = useState<Set<string>>(new Set());
  const [selectionAnchor, setSelectionAnchor] = useState<{
    sectionId: ProjectGitChangesSection["id"];
    path: string;
  } | null>(null);
  const [collapsedFolderKeys, setCollapsedFolderKeys] = useState<Set<string>>(new Set());

  const visibleSections = sections.filter((section) => section.files.length > 0);
  const shouldShowContextMenu = Boolean(
    onCopyFilePath || onCopyRelativeFilePath || (!readOnly && (onTrackFile || onRevertFile)),
  );

  const toggleSection = (sectionId: string) => {
    setCollapsedSectionIds((prev) => {
      const next = new Set(prev);

      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }

      return next;
    });
  };

  /** Toggles one folder group visibility inside a section. */
  const toggleFolder = (sectionId: string, folder: string) => {
    const folderCollapseKey = getFolderCollapseKey(sectionId, folder);
    setCollapsedFolderKeys((previous) => {
      const next = new Set(previous);

      if (next.has(folderCollapseKey)) {
        next.delete(folderCollapseKey);
      } else {
        next.add(folderCollapseKey);
      }

      return next;
    });
  };

  /** Opens one file-row context menu at the pointer position. */
  const handleFileContextMenu = (
    event: ReactMouseEvent,
    file: ProjectGitChangeItem,
    sectionId: ProjectGitChangesSection["id"],
  ) => {
    event.preventDefault();
    setContextMenuState({
      file,
      sectionId,
      top: event.clientY,
      left: event.clientX,
    });
  };

  /** Closes the context menu and clears selected file metadata. */
  const closeContextMenu = () => {
    setContextMenuState(null);
  };

  /** Starts one file drag operation and records source metadata. */
  const handleFileDragStart = (
    event: ReactDragEvent,
    file: ProjectGitChangeItem,
    sectionId: ProjectGitChangesSection["id"],
  ) => {
    const clickedFileKey = getFileSelectionKey(sectionId, file.path);
    const selectedFilesInSection = selectedFileKeys.has(clickedFileKey)
      ? (sections.find((section) => section.id === sectionId)?.files ?? []).filter((candidate) =>
          selectedFileKeys.has(getFileSelectionKey(sectionId, candidate.path)),
        )
      : [];
    const files = selectedFilesInSection.length > 0 ? selectedFilesInSection : [file];

    if (selectedFilesInSection.length === 0) {
      setSelectedFileKeys(new Set([clickedFileKey]));
      setSelectionAnchor({ sectionId, path: file.path });
    }

    setDraggedFileState({ files, sectionId });
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", files.map((candidate) => candidate.path).join("\n"));
    }
  };

  /** Clears transient drag state after drag completes or is cancelled. */
  const handleFileDragEnd = () => {
    setDraggedFileState(null);
    setDragOverSectionId(null);
  };

  /** Enables dropping on sections only when one valid git state transition exists. */
  const handleSectionDragOver = (event: ReactDragEvent, targetSectionId: ProjectGitChangesSection["id"]) => {
    if (!draggedFileState || !canMoveFileBetweenSections(draggedFileState.sectionId, targetSectionId)) {
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
    if (dragOverSectionId !== targetSectionId) {
      setDragOverSectionId(targetSectionId);
    }
  };

  /** Applies one section drop operation by delegating to the parent handler. */
  const handleSectionDrop = (event: ReactDragEvent, targetSectionId: ProjectGitChangesSection["id"]) => {
    event.preventDefault();
    if (!draggedFileState || !canMoveFileBetweenSections(draggedFileState.sectionId, targetSectionId)) {
      handleFileDragEnd();
      return;
    }

    if (onMoveFiles) {
      onMoveFiles(draggedFileState.files, draggedFileState.sectionId, targetSectionId);
    } else if (draggedFileState.files[0]) {
      onMoveFile?.(draggedFileState.files[0], draggedFileState.sectionId, targetSectionId);
    }
    handleFileDragEnd();
  };

  /** Handles click selection, including section-local shift-range selection. */
  const handleFileClick = (event: ReactMouseEvent, file: ProjectGitChangeItem, section: ProjectGitChangesSection) => {
    const clickedFileKey = getFileSelectionKey(section.id, file.path);
    if (event.shiftKey) {
      if (!selectionAnchor || selectionAnchor.sectionId !== section.id) {
        setSelectedFileKeys(new Set([clickedFileKey]));
        setSelectionAnchor({ sectionId: section.id, path: file.path });
        return;
      }

      const anchorIndex = section.files.findIndex((candidate) => candidate.path === selectionAnchor.path);
      const targetIndex = section.files.findIndex((candidate) => candidate.path === file.path);
      if (anchorIndex < 0 || targetIndex < 0) {
        setSelectedFileKeys(new Set([clickedFileKey]));
        setSelectionAnchor({ sectionId: section.id, path: file.path });
        return;
      }

      const [start, end] = anchorIndex <= targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
      const nextSelection = new Set<string>();
      for (let index = start; index <= end; index += 1) {
        const rangeFile = section.files[index];
        if (rangeFile) {
          nextSelection.add(getFileSelectionKey(section.id, rangeFile.path));
        }
      }

      setSelectedFileKeys(nextSelection);
      return;
    }

    setSelectedFileKeys(new Set([clickedFileKey]));
    setSelectionAnchor({ sectionId: section.id, path: file.path });
    onSelectFile?.(file);
  };

  return (
    <Box
      data-testid="changes-list-root"
      sx={{ flex: 1, minWidth: 0, minHeight: 0, px: 1.5, py: 1, overflowY: "auto", overflowX: "hidden" }}
    >
      {visibleSections.map((section) => {
        const groupedFolders = groupByFolder(section.files);
        const isCollapsed = collapsedSectionIds.has(section.id);
        const trackActionMeta = getTrackActionMeta(section.id);
        const showRevertAction = shouldShowRevertAction(section.id);
        const restoreActionVerb = getRestoreActionVerb(section.id);

        return (
          <Box
            key={section.id}
            data-testid={`changes-section-${section.id}`}
            onDragOver={readOnly ? undefined : (event) => handleSectionDragOver(event, section.id)}
            onDrop={readOnly ? undefined : (event) => handleSectionDrop(event, section.id)}
            sx={{
              mb: 1.5,
              borderRadius: 1,
              outline: !readOnly && dragOverSectionId === section.id ? 1 : 0,
              outlineColor: "primary.main",
            }}
          >
            <GitChangesSectionHeader
              section={section}
              isCollapsed={isCollapsed}
              readOnly={readOnly}
              onToggle={() => toggleSection(section.id)}
              onTrackSection={onTrackSection}
              onRevertSection={onRevertSection}
            />

            {isCollapsed
              ? null
              : groupedFolders.map((group) => (
                  <Box key={`${section.id}-${group.folder}`} sx={{ mb: 0.5 }}>
                    {(() => {
                      const canFoldFolder = section.id === "untracked" && group.folder !== ".";
                      const folderCollapseKey = getFolderCollapseKey(section.id, group.folder);
                      const isFolderCollapsed = canFoldFolder && collapsedFolderKeys.has(folderCollapseKey);

                      return (
                        <>
                          {group.folder === "." ? null : (
                            <Box
                              sx={{
                                height: 30,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                color: "text.secondary",
                                minWidth: 0,
                              }}
                            >
                              <Box sx={{ display: "flex", alignItems: "center", minWidth: 0, flex: 1 }}>
                                {canFoldFolder ? (
                                  <ButtonBase
                                    disableRipple
                                    onClick={() => toggleFolder(section.id, group.folder)}
                                    aria-label={
                                      isFolderCollapsed
                                        ? `Expand folder ${group.folder}`
                                        : `Collapse folder ${group.folder}`
                                    }
                                    sx={{
                                      width: 18,
                                      height: 18,
                                      mr: 0.5,
                                      color: "text.secondary",
                                      borderRadius: 0.5,
                                      flexShrink: 0,
                                    }}
                                  >
                                    {isFolderCollapsed ? <LuChevronRight size={12} /> : <LuChevronDown size={12} />}
                                  </ButtonBase>
                                ) : null}
                                <Typography
                                  variant="body2"
                                  title={group.folder}
                                  sx={{
                                    fontSize: 12,
                                    flex: 1,
                                    minWidth: 0,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {group.folder}
                                </Typography>
                              </Box>
                              <Typography variant="body2" sx={{ ml: 1, flexShrink: 0, fontSize: 12 }}>
                                {group.files.length}
                              </Typography>
                            </Box>
                          )}

                          {isFolderCollapsed ? null : (
                            <Box
                              sx={
                                group.folder === "." ? undefined : { borderLeft: 1, borderColor: "divider", ml: 0.75 }
                              }
                            >
                              {group.files.map((file) => {
                                const fileSelectionKey = getFileSelectionKey(section.id, file.path);
                                const isSelected = selectedFileKeys.has(fileSelectionKey);

                                return (
                                  <GitChangesFileRow
                                    key={`${section.id}-${file.path}`}
                                    file={file}
                                    section={section}
                                    isSelected={isSelected}
                                    readOnly={readOnly}
                                    showContextMenu={shouldShowContextMenu}
                                    showRevertAction={showRevertAction}
                                    trackVerb={trackActionMeta.verb}
                                    restoreVerb={restoreActionVerb}
                                    TrackIcon={trackActionMeta.FileIcon}
                                    onFileClick={handleFileClick}
                                    onContextMenu={handleFileContextMenu}
                                    onRevertFile={onRevertFile}
                                    onTrackFile={onTrackFile}
                                    onDragStart={handleFileDragStart}
                                    onDragEnd={handleFileDragEnd}
                                  />
                                );
                              })}
                            </Box>
                          )}
                        </>
                      );
                    })()}
                  </Box>
                ))}
          </Box>
        );
      })}
      {shouldShowContextMenu ? (
        <GitChangesContextMenu
          menuState={contextMenuState}
          readOnly={readOnly}
          onClose={closeContextMenu}
          onTrackFile={onTrackFile}
          onRevertFile={onRevertFile}
          onCopyFilePath={onCopyFilePath}
          onCopyRelativeFilePath={onCopyRelativeFilePath}
        />
      ) : null}
    </Box>
  );
}
