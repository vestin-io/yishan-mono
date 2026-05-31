import { Box, ListItemIcon, Menu, MenuItem } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuSettings, LuTrash2 } from "react-icons/lu";
import {
  EXTERNAL_APP_MENU_ENTRIES,
  type ExternalAppId,
  JETBRAINS_EXTERNAL_APP_IDS,
  SYSTEM_FILE_MANAGER_APP_ID,
  findExternalAppPreset,
  isExternalAppPlatformSupported,
} from "../../../../shared/contracts/externalApps";
import { OPEN_CREATE_WORKSPACE_DIALOG_EVENT } from "../../../commands/workspaceCommands";
import { ContextMenu, type ContextMenuEntry } from "../../../components/ContextMenu";
import { WorkspaceTree } from "../../../components/WorkspaceTree";
import type { WorkspaceTreeWorkspace } from "../../../components/WorkspaceTree";
import type { WorkspaceTreeRow } from "../../../components/WorkspaceTree/types";
import { getRendererPlatform } from "../../../helpers/platform";
import { useCommands } from "../../../hooks/useCommands";
import { useContextMenuState } from "../../../hooks/useContextMenuState";
import { useSuppressNativeContextMenuWhileOpen } from "../../../hooks/useSuppressNativeContextMenuWhileOpen";
import { getShortcutDisplayLabelById } from "../../../shortcuts/shortcutDisplay";
import { chatStore } from "../../../store/chatStore";
import { workspaceStore } from "../../../store/workspaceStore";
import { CreateWorkspaceDialogView } from "./CreateWorkspaceDialogView";
import { ProjectConfigDialogView } from "./ProjectConfigDialogView";
import { ProjectDeleteDialogView } from "./ProjectDeleteDialogView";
import { WorkspaceDeleteDialogView } from "./WorkspaceDeleteDialogView";
import { WorkspaceInfoPopperView } from "./WorkspaceInfoPopperView";
import { parseNodeRowNodeId, parseProjectRowProjectId, reconcileOrder, reorderIds } from "./projectListHelpers";
import { useProjectDeletionFlow } from "./useProjectDeletionFlow";
import { useProjectListDialogState } from "./useProjectListDialogState";
import { useProjectListFoldState } from "./useProjectListFoldState";
import { useProjectListTreeData } from "./useProjectListTreeData";
import { useWorkspaceDeletionFlow } from "./useWorkspaceDeletionFlow";
import { useWorkspaceInfoHover } from "./useWorkspaceInfoHover";

/** Renders project rows and nested workspace rows with per-project fold controls. */
export function ProjectListView() {
  const { t } = useTranslation();
  const projects = workspaceStore((state) => state.projects) ?? [];
  const workspaces = workspaceStore((state) => state.workspaces) ?? [];
  const selectedProjectId = workspaceStore((state) => state.selectedProjectId);
  const selectedWorkspaceId = workspaceStore((state) => state.selectedWorkspaceId);
  const lastUsedExternalAppId = workspaceStore((state) => state.lastUsedExternalAppId);
  const {
    setSelectedRepoId,
    setSelectedWorkspaceId,
    reorderWorkspace,
    closeWorkspace,
    deleteProject,
    openEntryInExternalApp,
    setLastUsedExternalAppId,
  } = useCommands();
  const workspaceUnreadToneByWorkspaceId = chatStore((state) => state.workspaceUnreadToneByWorkspaceId);
  const markWorkspaceNotificationsRead = chatStore((state) => state.markWorkspaceNotificationsRead);
  const {
    menu: projectContextMenu,
    openMenu: openProjectContextMenu,
    closeMenu: closeProjectContextMenu,
    isOpen: isProjectContextMenuOpen,
  } = useContextMenuState<{
    repoId: string;
    mouseX: number;
    mouseY: number;
  }>();
  const {
    menu: workspaceContextMenu,
    openMenu: openWorkspaceContextMenu,
    closeMenu: closeWorkspaceContextMenu,
    isOpen: isWorkspaceContextMenuOpen,
  } = useContextMenuState<{
    repoId: string;
    workspaceId: string;
    mouseX: number;
    mouseY: number;
  }>();
  const {
    isCreateWorkspaceOpen,
    createWorkspaceProjectId,
    renameWorkspaceContext,
    isProjectConfigOpen,
    projectConfigProjectId,
    setIsCreateWorkspaceOpen,
    setCreateWorkspaceProjectId,
    setRenameWorkspaceContext,
    setIsProjectConfigOpen,
    setProjectConfigProjectId,
    handleOpenCreateWorkspace,
    handleOpenProjectConfig,
  } = useProjectListDialogState();
  const {
    pendingWorkspaceDeletion,
    isDeletingWorkspace,
    setPendingWorkspaceDeletion,
    handleRequestWorkspaceDeletion,
    handleCancelWorkspaceDeletion,
    handleConfirmWorkspaceDeletion,
  } = useWorkspaceDeletionFlow({
    workspaces,
    closeWorkspace,
  });
  const {
    pendingProjectDeletion,
    isDeletingProject,
    handleRequestProjectDeletion,
    handleCancelProjectDeletion,
    handleConfirmProjectDeletion,
  } = useProjectDeletionFlow({
    projects,
    deleteProject,
  });
  const [projectActionsAnchorEl, setProjectActionsAnchorEl] = useState<HTMLElement | null>(null);
  const [projectActionsProjectId, setProjectActionsProjectId] = useState("");

  const {
    projectOrderIds,
    nodeOrderByParentId,
    foldedProjectIds,
    foldedNodeKeys,
    setProjectOrderIds,
    setNodeOrderByParentId,
    setFoldedProjectIds,
    setFoldedNodeKeys,
    toggleProjectFold,
    workspaceListHierarchyMode,
  } = useProjectListFoldState();

  const {
    filteredProjects,
    treeProjects,
    treeNodes,
    treeWorkspaces,
    expandedTreeItems,
    displayWorkspaceIdByProjectId,
    workspaceByProjectId,
  } = useProjectListTreeData({
    projectOrderIds,
    nodeOrderByParentId,
    foldedProjectIds,
    foldedNodeKeys,
    workspaceListHierarchyMode,
  });

  const [isAppFocused, setIsAppFocused] = useState(() => document.hasFocus());
  const rendererPlatform = getRendererPlatform();
  const canOpenWorkspaceInExternalApp = isExternalAppPlatformSupported(rendererPlatform);
  const openWorkspaceInFileManagerActionLabel =
    rendererPlatform === "win32" ? t("workspace.actions.openInExplorer") : t("workspace.actions.openInFinder");
  const createWorkspaceShortcutLabel = getShortcutDisplayLabelById("create-workspace", rendererPlatform);
  const createWorkspaceTooltipLabel = createWorkspaceShortcutLabel
    ? t("layout.toggleWithShortcut", {
        label: t("workspace.actions.add"),
        shortcut: createWorkspaceShortcutLabel,
      })
    : t("workspace.actions.add");
  const lastUsedWorkspaceExternalAppPreset = lastUsedExternalAppId
    ? findExternalAppPreset(lastUsedExternalAppId)
    : null;
  const openWorkspaceInLastUsedExternalAppActionLabel = lastUsedWorkspaceExternalAppPreset
    ? t("workspace.actions.openInExternalAppQuick", { app: lastUsedWorkspaceExternalAppPreset.label })
    : "";

  useEffect(() => {
    const handleWindowFocus = () => {
      setIsAppFocused(true);
    };
    const handleWindowBlur = () => {
      setIsAppFocused(false);
    };

    window.addEventListener("focus", handleWindowFocus);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, []);

  useEffect(() => {
    const focusedWorkspaceId = selectedWorkspaceId.trim();
    if (!isAppFocused || !focusedWorkspaceId) {
      return;
    }

    if (!(focusedWorkspaceId in workspaceUnreadToneByWorkspaceId)) {
      return;
    }

    markWorkspaceNotificationsRead(focusedWorkspaceId);
  }, [isAppFocused, markWorkspaceNotificationsRead, selectedWorkspaceId, workspaceUnreadToneByWorkspaceId]);
  /** Closes workspace context menu and nested submenu layers together. */
  const closeWorkspaceMenus = () => {
    closeWorkspaceContextMenu();
  };

  /** Closes all left-pane context menus and nested submenus together. */
  const closeAllContextMenus = () => {
    closeProjectContextMenu();
    closeWorkspaceMenus();
    setProjectActionsAnchorEl(null);
    setProjectActionsProjectId("");
  };

  const workspaceContextTarget =
    workspaceContextMenu &&
    workspaces.find(
      (workspace) => workspace.repoId === workspaceContextMenu.repoId && workspace.id === workspaceContextMenu.workspaceId,
    );
  const isWorkspaceContextTargetLocal = Boolean(
    workspaceContextTarget &&
      (workspaceContextTarget.kind === "local" ||
        displayWorkspaceIdByProjectId[workspaceContextTarget.repoId] === workspaceContextTarget.id),
  );

  const {
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
  } = useWorkspaceInfoHover({
    workspaces,
    displayWorkspaceIdByProjectId,
  });

  useEffect(() => {
      const handleOpenCreateWorkspaceDialog = (event: Event) => {
        const customEvent = event as CustomEvent<{ repoId?: string }>;
        const requestedProjectId = customEvent.detail?.repoId?.trim();
        if (!requestedProjectId) {
          return;
        }

        handleOpenCreateWorkspace(requestedProjectId);
      };

    window.addEventListener(OPEN_CREATE_WORKSPACE_DIALOG_EVENT, handleOpenCreateWorkspaceDialog as EventListener);
    return () => {
      window.removeEventListener(OPEN_CREATE_WORKSPACE_DIALOG_EVENT, handleOpenCreateWorkspaceDialog as EventListener);
    };
  }, [handleOpenCreateWorkspace]);


  useSuppressNativeContextMenuWhileOpen(isProjectContextMenuOpen || isWorkspaceContextMenuOpen);

  /** Opens one workspace root path in a selected external app preset. */
  const handleOpenWorkspaceInExternalApp = async (appId: ExternalAppId) => {
    const targetWorkspaceId = workspaceContextMenu?.workspaceId;
    if (!targetWorkspaceId) {
      return;
    }

    const targetWorkspace = workspaces.find((workspace) => workspace.id === targetWorkspaceId);
    const targetWorktreePath = targetWorkspace?.worktreePath?.trim();
    if (!targetWorktreePath) {
      closeWorkspaceMenus();
      return;
    }

    try {
      await openEntryInExternalApp({
        workspaceWorktreePath: targetWorktreePath,
        appId,
      });
      setLastUsedExternalAppId(appId);
    } catch (error) {
      console.error("Failed to open workspace root in external app", error);
    } finally {
      closeWorkspaceMenus();
    }
  };

  /** Opens one workspace root path in the host OS file manager. */
  const handleOpenWorkspaceInFileManager = async () => {
    const targetWorkspaceId = workspaceContextMenu?.workspaceId;
    if (!targetWorkspaceId) {
      return;
    }

    const targetWorkspace = workspaces.find((workspace) => workspace.id === targetWorkspaceId);
    const targetWorktreePath = targetWorkspace?.worktreePath?.trim();
    if (!targetWorktreePath) {
      closeWorkspaceMenus();
      return;
    }

    try {
      await openEntryInExternalApp({
        workspaceWorktreePath: targetWorktreePath,
        appId: SYSTEM_FILE_MANAGER_APP_ID,
      });
    } catch (error) {
      console.error("Failed to open workspace root in file manager", error);
    } finally {
      closeWorkspaceMenus();
    }
  };

  const projectContextMenuItems: ContextMenuEntry[] = [
    {
      id: "repo-config",
      label: t("project.actions.config"),
      icon: <LuSettings size={14} />,
      onSelect: () => {
        if (!projectContextMenu) {
          return;
        }

        handleOpenProjectConfig(projectContextMenu.repoId);
      },
    },
    {
      id: "repo-delete",
      label: t("project.actions.delete"),
      icon: <LuTrash2 size={14} />,
      onSelect: () => {
        if (!projectContextMenu) {
          return;
        }

        handleRequestProjectDeletion(projectContextMenu.repoId);
      },
    },
  ];

  const workspaceExternalAppItems: ContextMenuEntry[] = EXTERNAL_APP_MENU_ENTRIES.reduce<ContextMenuEntry[]>(
    (items, entry) => {
      if (entry.kind === "app") {
        const appPreset = findExternalAppPreset(entry.appId);
        if (!appPreset) {
          return items;
        }

        items.push({
          id: appPreset.id,
          label: appPreset.label,
          icon: <Box component="img" src={appPreset.iconSrc} alt="" sx={{ width: 16, height: 16 }} />,
          onSelect: () => {
            void handleOpenWorkspaceInExternalApp(appPreset.id);
          },
        });
        return items;
      }

      const jetBrainsItems: ContextMenuEntry[] = JETBRAINS_EXTERNAL_APP_IDS.reduce<ContextMenuEntry[]>(
        (childItems, appId) => {
          const appPreset = findExternalAppPreset(appId);
          if (!appPreset) {
            return childItems;
          }

          childItems.push({
            id: appPreset.id,
            label: appPreset.label,
            icon: <Box component="img" src={appPreset.iconSrc} alt="" sx={{ width: 16, height: 16 }} />,
            onSelect: () => {
              void handleOpenWorkspaceInExternalApp(appPreset.id);
            },
          });
          return childItems;
        },
        [],
      );

      items.push({
        id: `group-${entry.id}`,
        label: entry.label,
        icon: <Box component="img" src={entry.iconSrc} alt="" sx={{ width: 16, height: 16 }} />,
        items: jetBrainsItems,
      });
      return items;
    },
    [],
  );

  const workspaceContextMenuItems: ContextMenuEntry[] = [
    {
      id: "workspace-open-in-file-manager",
      label: openWorkspaceInFileManagerActionLabel,
      onSelect: () => {
        void handleOpenWorkspaceInFileManager();
      },
    },
    ...(canOpenWorkspaceInExternalApp && lastUsedWorkspaceExternalAppPreset
      ? [
          {
            id: "workspace-open-last-used-external-app",
            label: openWorkspaceInLastUsedExternalAppActionLabel,
            endAdornment: (
              <Box
                component="img"
                src={lastUsedWorkspaceExternalAppPreset.iconSrc}
                alt=""
                sx={{ width: 16, height: 16, ml: 1 }}
              />
            ),
            onSelect: () => {
              void handleOpenWorkspaceInExternalApp(lastUsedWorkspaceExternalAppPreset.id);
            },
          },
        ]
      : []),
    ...(canOpenWorkspaceInExternalApp
      ? [
          {
            id: "workspace-open-external-app-submenu",
            label: t("workspace.actions.openInExternalApp"),
            items: workspaceExternalAppItems,
          },
        ]
      : []),
    ...(workspaceContextMenu && !isWorkspaceContextTargetLocal
      ? [
          {
            id: "workspace-rename",
            label: t("workspace.actions.rename"),
            onSelect: () => {
              if (!workspaceContextMenu) {
                return;
              }

              const workspace = workspaces.find((item) => item.id === workspaceContextMenu.workspaceId);
              const isWorkspaceDisplayedAsLocal =
                workspace?.kind === "local" ||
                (workspace ? displayWorkspaceIdByProjectId[workspace.repoId] === workspace.id : false);
              if (!workspace || isWorkspaceDisplayedAsLocal) {
                return;
              }

              closeWorkspaceMenus();
              setRenameWorkspaceContext({
                projectId: workspace.repoId,
                workspaceId: workspace.id,
              });
            },
          },
          {
            id: "workspace-delete",
            label: t("workspace.actions.delete"),
            onSelect: () => {
              if (!workspaceContextMenu) {
                return;
              }

              handleRequestWorkspaceDeletion(workspaceContextMenu.repoId, workspaceContextMenu.workspaceId);
            },
          },
        ]
      : []),
  ];
  const projectContextMenuAnchorPosition = useMemo(
    () =>
      projectContextMenu
        ? {
            top: projectContextMenu.mouseY,
            left: projectContextMenu.mouseX,
          }
        : undefined,
    [projectContextMenu],
  );
  const workspaceContextMenuAnchorPosition = useMemo(
    () =>
      workspaceContextMenu
        ? {
            top: workspaceContextMenu.mouseY,
            left: workspaceContextMenu.mouseX,
          }
        : undefined,
    [workspaceContextMenu],
  );

  return (
    <>
      <Box data-testid="repo-workspace-list" sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <WorkspaceTree
          projects={treeProjects}
          nodes={treeNodes}
          workspaces={treeWorkspaces}
          selectedProjectId={selectedProjectId}
          selectedWorkspaceId={selectedWorkspaceId}
          hierarchyMode={workspaceListHierarchyMode}
          expandedItems={expandedTreeItems}
          onExpandedItemsChange={(items) => {
            if (workspaceListHierarchyMode === "by_node") {
              const expandedNodeIds = new Set(
                items
                  .filter((item) => item.startsWith("node:"))
                  .map((item) => item.replace(/^node:/, "")),
              );
              const expandedProjectKeys = new Set(
                items
                  .filter((item) => item.startsWith("project:"))
                  .map((item) => item.replace(/^project:/, "")),
              );
              const visibleNodeIds = Array.from(new Set(treeWorkspaces.map((workspace) => workspace.nodeId)));
              const visibleProjectKeys = Array.from(
                new Set(treeWorkspaces.map((workspace) => `${workspace.nodeId}:${workspace.projectId}`)),
              );
              setFoldedProjectIds(visibleNodeIds.filter((nodeId) => !expandedNodeIds.has(nodeId)));
            setFoldedNodeKeys((current) => {
              const next = new Set(current);
              for (const projectKey of visibleProjectKeys) {
                const [nodeId] = projectKey.split(":");
                if (!nodeId || !expandedNodeIds.has(nodeId)) {
                  continue;
                }

                if (expandedProjectKeys.has(projectKey)) {
                  next.delete(projectKey);
                } else {
                  // Only mark as folded if the parent node was already expanded before
                  // this change. If the node was just re-expanded (was in foldedProjectIds),
                  // absence of the project key from items means the tree hasn't rendered
                  // it yet — not that the user folded it.
                  const nodeWasPreviouslyFolded = foldedProjectIds.includes(nodeId);
                  if (!nodeWasPreviouslyFolded) {
                    next.add(projectKey);
                  }
                }
              }
              return Array.from(next);
            });
              return;
            }

            const expandedProjectIds = new Set(
              items
                .filter((item) => item.startsWith("project:"))
                .map((item) => item.replace(/^project:/, "")),
            );
            const expandedNodeKeys = new Set(
              items
                .filter((item) => item.startsWith("node:"))
                .map((item) => item.replace(/^node:/, "")),
            );
            const nextFoldedProjectIds = filteredProjects
              .map((project) => project.id)
              .filter((projectId) => !expandedProjectIds.has(projectId));
            const visibleNodeKeys = Array.from(new Set(treeWorkspaces.map((workspace) => `${workspace.projectId}:${workspace.nodeId}`)));
            setFoldedProjectIds(nextFoldedProjectIds);
            setFoldedNodeKeys((current) => {
              const next = new Set(current);
              for (const nodeKey of visibleNodeKeys) {
                const [projectId] = nodeKey.split(":");
                if (!projectId) {
                  continue;
                }

                if (!expandedProjectIds.has(projectId)) {
                  next.delete(nodeKey);
                  continue;
                }

                if (expandedNodeKeys.has(nodeKey)) {
                  next.delete(nodeKey);
                } else {
                  // Only mark as folded if the project was already expanded before
                  // this change. If the project was just re-expanded (was in
                  // foldedProjectIds), absence means the tree hasn't rendered the
                  // child yet — not that the user explicitly folded the node.
                  const projectWasPreviouslyFolded = foldedProjectIds.includes(projectId);
                  if (!projectWasPreviouslyFolded) {
                    next.add(nodeKey);
                  }
                }
              }
              return Array.from(next);
            });
          }}
          deleteWorkspaceLabel={t("workspace.actions.delete")}
          createWorkspaceTooltipLabel={createWorkspaceTooltipLabel}
          onSelectProject={(projectId) => {
            setSelectedRepoId(projectId);
            if (workspaceListHierarchyMode === "by_project") {
              setFoldedProjectIds((current) => current.filter((item) => item !== projectId));
            }
          }}
          onSelectWorkspace={(workspaceId, projectId) => {
            setSelectedRepoId(projectId);
            setSelectedWorkspaceId(workspaceId);
            setFoldedProjectIds((current) => current.filter((item) => item !== projectId));
          }}
          onProjectContextMenu={(event, projectId) => {
            event.preventDefault();
            event.stopPropagation();
            closeWorkspaceMenus();
            setSelectedRepoId(projectId);
            openProjectContextMenu({
              repoId: projectId,
              mouseX: event.clientX,
              mouseY: event.clientY,
            });
          }}
          onProjectActionsClick={(event, projectId) => {
            closeAllContextMenus();
            setSelectedRepoId(projectId);
            setProjectActionsAnchorEl(event.currentTarget);
            setProjectActionsProjectId(projectId);
          }}
          onProjectCreateWorkspaceClick={(event, projectId) => {
            event.preventDefault();
            event.stopPropagation();
            closeAllContextMenus();
            setSelectedRepoId(projectId);
            handleOpenCreateWorkspace(projectId);
          }}
          onWorkspaceContextMenu={(event, workspaceId, projectId) => {
            event.preventDefault();
            event.stopPropagation();
            closeProjectContextMenu();
            closeWorkspaceMenus();
            setSelectedRepoId(projectId);
            setSelectedWorkspaceId(workspaceId);
            openWorkspaceContextMenu({
              repoId: projectId,
              workspaceId,
              mouseX: event.clientX,
              mouseY: event.clientY,
            });
          }}
          onWorkspaceMouseEnter={(event, workspaceId) => {
            handleWorkspaceInfoMouseEnter(workspaceId, event.currentTarget);
          }}
          onWorkspaceMouseLeave={handleWorkspaceInfoMouseLeave}
          onWorkspaceRequestDelete={(workspaceId, projectId) => {
            handleRequestWorkspaceDeletion(projectId, workspaceId);
          }}
          onRowReorder={({ draggedRowId, targetRowId, rowKind, parentId, position }) => {
            if (rowKind === "workspace") {
              const draggedId = draggedRowId.replace(/^workspace:/, "");
              const targetId = targetRowId.replace(/^workspace:/, "");
              reorderWorkspace({
                draggedWorkspaceId: draggedId,
                targetWorkspaceId: targetId,
                position,
              });
              return;
            }

            if (rowKind === "project") {
              const draggedProjectId = parseProjectRowProjectId(draggedRowId);
              const targetProjectId = parseProjectRowProjectId(targetRowId);
              if (workspaceListHierarchyMode === "by_node" && parentId) {
                const parentNodeId = parentId.replace(/^node:/, "").split(":")[0] ?? "";
                const projectIdsUnderNode = Array.from(
                  new Set(
                    treeWorkspaces
                      .filter((workspace) => workspace.nodeId === parentNodeId)
                      .map((workspace) => workspace.projectId),
                  ),
                );
                const currentOrder = reconcileOrder(
                  nodeOrderByParentId[parentId] ?? [],
                  projectIdsUnderNode,
                );
                const nextOrder = reorderIds({
                  ids: currentOrder,
                  draggedId: draggedProjectId,
                  targetId: targetProjectId,
                  position,
                });
                setNodeOrderByParentId((current) => ({
                  ...current,
                  [parentId]: nextOrder,
                }));
                return;
              }

              const liveProjectIds = filteredProjects.map((project) => project.id);
              const nextProjectIds = reorderIds({
                ids: reconcileOrder(projectOrderIds, liveProjectIds),
                draggedId: draggedProjectId,
                targetId: targetProjectId,
                position,
              });
              setProjectOrderIds(nextProjectIds);
              return;
            }

            if (rowKind === "node") {
              const draggedNodeId = parseNodeRowNodeId(draggedRowId);
              const targetNodeId = parseNodeRowNodeId(targetRowId);
              const reorderParentId = parentId ?? "root:node";
              const nodeIdsUnderParent = Array.from(
                new Set(
                  treeWorkspaces
                    .filter((workspace) => {
                      // "root:node" is the synthetic parent for top-level nodes in by_node mode;
                      // every workspace belongs to a node, so include all.
                      if (reorderParentId === "root:node") {
                        return true;
                      }

                      if (workspaceListHierarchyMode === "by_project") {
                        return `project:${workspace.projectId}` === reorderParentId;
                      }

                      return `node:${workspace.nodeId}` === reorderParentId;
                    })
                    .map((workspace) => workspace.nodeId),
                ),
              );
              const currentOrder = reconcileOrder(
                nodeOrderByParentId[reorderParentId] ?? [],
                nodeIdsUnderParent,
              );
              const nextOrder = reorderIds({
                ids: currentOrder,
                draggedId: draggedNodeId,
                targetId: targetNodeId,
                position,
              });
              setNodeOrderByParentId((current) => ({
                ...current,
                [reorderParentId]: nextOrder,
              }));
            }
          }}
        />
      </Box>
      <Menu
        open={Boolean(projectActionsAnchorEl && projectActionsProjectId)}
        anchorEl={projectActionsAnchorEl}
        onClose={() => {
          setProjectActionsAnchorEl(null);
          setProjectActionsProjectId("");
        }}
      >
        <MenuItem
          onClick={() => {
            if (!projectActionsProjectId) {
              return;
            }

            handleOpenProjectConfig(projectActionsProjectId);
            setProjectActionsAnchorEl(null);
            setProjectActionsProjectId("");
          }}
        >
          <ListItemIcon>
            <LuSettings size={14} />
          </ListItemIcon>
          {t("project.actions.config")}
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (!projectActionsProjectId) {
              return;
            }

            handleRequestProjectDeletion(projectActionsProjectId);
            setProjectActionsAnchorEl(null);
            setProjectActionsProjectId("");
          }}
        >
          <ListItemIcon>
            <LuTrash2 size={14} />
          </ListItemIcon>
          {t("project.actions.delete")}
        </MenuItem>
      </Menu>
      <ContextMenu
        open={Boolean(projectContextMenu)}
        onClose={closeAllContextMenus}
        anchorPosition={projectContextMenuAnchorPosition}
        items={projectContextMenuItems}
      />
      <ContextMenu
        open={Boolean(workspaceContextMenu)}
        onClose={closeWorkspaceMenus}
        anchorPosition={workspaceContextMenuAnchorPosition}
        items={workspaceContextMenuItems}
      />
      <CreateWorkspaceDialogView
        open={isCreateWorkspaceOpen}
        projectId={createWorkspaceProjectId}
        onClose={() => {
          setIsCreateWorkspaceOpen(false);
          setCreateWorkspaceProjectId("");
        }}
      />
      <CreateWorkspaceDialogView
        mode="rename"
        open={Boolean(renameWorkspaceContext)}
        projectId={renameWorkspaceContext?.projectId ?? ""}
        workspaceId={renameWorkspaceContext?.workspaceId ?? ""}
        onClose={() => {
          setRenameWorkspaceContext(null);
        }}
      />
      <ProjectConfigDialogView
        open={isProjectConfigOpen}
        repoId={projectConfigProjectId}
        onClose={() => {
          setIsProjectConfigOpen(false);
          setProjectConfigProjectId("");
        }}
      />
      <WorkspaceDeleteDialogView
        open={Boolean(pendingWorkspaceDeletion)}
        workspaceName={pendingWorkspaceDeletion?.workspaceName ?? ""}
        allowRemoveBranch={pendingWorkspaceDeletion?.allowRemoveBranch ?? true}
        isDeleting={isDeletingWorkspace}
        onCancel={handleCancelWorkspaceDeletion}
        onConfirm={() => void handleConfirmWorkspaceDeletion()}
        onAllowRemoveBranchChange={(nextValue) => {
          if (!pendingWorkspaceDeletion) {
            return;
          }

          setPendingWorkspaceDeletion({
            ...pendingWorkspaceDeletion,
            allowRemoveBranch: nextValue,
          });
        }}
      />
      <ProjectDeleteDialogView
         open={Boolean(pendingProjectDeletion)}
         repoName={pendingProjectDeletion?.projectName ?? ""}
         isDeleting={isDeletingProject}
         onCancel={handleCancelProjectDeletion}
         onConfirm={() => void handleConfirmProjectDeletion()}
       />
      <WorkspaceInfoPopperView
        open={isWorkspaceInfoOpen}
        anchorEl={workspaceInfoAnchorEl}
        workspace={hoveredWorkspace}
        isPrimaryWorkspace={isHoveredWorkspacePrimary}
        currentBranch={hoveredWorkspaceCurrentBranch}
        pullRequest={hoveredWorkspacePullRequest}
        latestPullRequest={hoveredWorkspaceLatestPullRequest}
        onMouseEnter={handleWorkspaceInfoPopoverMouseEnter}
        onMouseLeave={handleWorkspaceInfoPopoverMouseLeave}
      />
    </>
  );
}
