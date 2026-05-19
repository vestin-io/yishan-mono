import {
  Autocomplete,
  Avatar,
  Box,
  Button,
  CircularProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import React, { forwardRef, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuCloud, LuServer } from "react-icons/lu";
import { api } from "../../api";
import type { CreateScheduledJobInput } from "../../api/scheduledJobApi";
import { AgentIcon } from "../../components/AgentIcon";
import { renderProjectIcon } from "../../components/projectIcons";
import {
  AGENT_SETTINGS_LABEL_KEY_BY_KIND,
  type DesktopAgentKind,
  SUPPORTED_DESKTOP_AGENT_KINDS,
} from "../../helpers/agentSettings";
import { getErrorMessage } from "../../helpers/errorHelpers";
import { useCommands } from "../../hooks/useCommands";
import { sessionStore } from "../../store/sessionStore";
import { workspaceStore } from "../../store/workspaceStore";

// ---------------------------------------------------------------------------
// Virtualised listbox for the timezone Autocomplete
// ---------------------------------------------------------------------------

const ITEM_HEIGHT = 36;
const MAX_VISIBLE_ITEMS = 8;

/**
 * Custom listbox component for MUI Autocomplete that virtualises its items
 * with @tanstack/react-virtual, keeping the DOM lean for large option sets.
 */
const VirtualizedListbox = forwardRef<HTMLUListElement, React.HTMLAttributes<HTMLElement>>(function VirtualizedListbox(
  { children, ...rest },
  ref,
) {
  const items = React.Children.toArray(children);
  const count = items.length;
  const containerRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 5,
  });

  const totalHeight = virtualizer.getTotalSize();
  const visibleHeight = Math.min(count, MAX_VISIBLE_ITEMS) * ITEM_HEIGHT;

  return (
    <ul ref={ref} {...rest} style={{ ...rest.style, padding: 0, margin: 0, listStyle: "none" }}>
      <div ref={containerRef} style={{ overflow: "auto", maxHeight: visibleHeight }}>
        <div style={{ height: totalHeight, position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualItem) => (
            <div
              key={virtualItem.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: virtualItem.size,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {items[virtualItem.index]}
            </div>
          ))}
        </div>
      </div>
    </ul>
  );
});

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

type FormDraft = {
  name: string;
  projectId: string;
  nodeId: string;
  agentKind: DesktopAgentKind;
  cronExpression: string;
  prompt: string;
  timezone: string;
};

/** IANA timezone names supported by the current JS runtime. */
const TIMEZONE_OPTIONS: string[] =
  typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["UTC"];

const DEFAULT_DRAFT: FormDraft = {
  name: "",
  projectId: "",
  nodeId: "",
  agentKind: "opencode",
  cronExpression: "0 9 * * 1-5",
  prompt: "",
  timezone: "UTC",
};

type CreateScheduledJobFormViewProps = {
  onCreated: () => void;
  onCancel?: () => void;
  onBusyChange?: (isBusy: boolean) => void;
};

/** Form for creating a new scheduled job. */
export function CreateScheduledJobFormView({ onCreated, onCancel, onBusyChange }: CreateScheduledJobFormViewProps) {
  const { t } = useTranslation();
  const { createScheduledJob } = useCommands();
  const orgId = sessionStore((state) => state.selectedOrganizationId);
  const daemonId = sessionStore((state) => state.daemonId);
  const selectedProjectId = workspaceStore((state) => state.selectedProjectId);
  const projects = workspaceStore((state) => state.projects);
  const [draft, setDraft] = useState<FormDraft>(() => ({
    ...DEFAULT_DRAFT,
    projectId: selectedProjectId ?? "",
  }));

  const nodesQuery = useQuery({
    queryKey: ["org-nodes", orgId],
    queryFn: () => api.node.listByOrg(orgId as string),
    enabled: Boolean(orgId),
  });

  // Once nodes load, pre-select the daemon's own node if the user hasn't
  // already picked one.
  useEffect(() => {
    const nodes = nodesQuery.data;
    if (!nodes || !daemonId) {
      return;
    }
    setDraft((prev) => {
      if (prev.nodeId) {
        return prev;
      }
      const daemonNode = nodes.find((node) => node.id === daemonId && node.scope === "private" && node.canUse);
      return daemonNode ? { ...prev, nodeId: daemonNode.id } : prev;
    });
  }, [nodesQuery.data, daemonId]);

  const createMutation = useMutation({
    mutationFn: async (input: CreateScheduledJobInput) => {
      await createScheduledJob(input);
    },
    onSuccess: () => {
      setDraft(DEFAULT_DRAFT);
      onCreated();
    },
  });

  const isCreating = createMutation.isPending;

  useEffect(() => {
    onBusyChange?.(isCreating);
  }, [isCreating, onBusyChange]);

  const isSubmitDisabled =
    isCreating ||
    !draft.name.trim() ||
    !draft.projectId ||
    !draft.nodeId ||
    !draft.cronExpression.trim() ||
    !draft.prompt.trim();

  const handleSubmit = () => {
    if (isSubmitDisabled) {
      return;
    }
    createMutation.mutate(
      {
        name: draft.name.trim(),
        projectId: draft.projectId,
        nodeId: draft.nodeId,
        agentKind: draft.agentKind,
        cronExpression: draft.cronExpression.trim(),
        prompt: draft.prompt.trim(),
        timezone: draft.timezone.trim() || "UTC",
      },
      {
        onError: (error) => {
          console.error("Failed to create scheduled job", error);
        },
      },
    );
  };

  const nodes = nodesQuery.data ?? [];
  const isNodesLoading = nodesQuery.isLoading;
  const nodesError = nodesQuery.isError ? getErrorMessage(nodesQuery.error) : null;

  return (
    <Stack
      spacing={2}
      component="form"
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      {/* Name */}
      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
          {t("scheduledJob.form.name")}
        </Typography>
        <TextField
          autoFocus
          size="small"
          fullWidth
          disabled={isCreating}
          value={draft.name}
          onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
          placeholder={t("scheduledJob.form.namePlaceholder")}
        />
      </Box>

      {/* Project */}
      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
          {t("scheduledJob.form.project")}
        </Typography>
        <TextField
          select
          size="small"
          fullWidth
          disabled={isCreating || projects.length === 0}
          value={draft.projectId}
          onChange={(e) => setDraft((prev) => ({ ...prev, projectId: e.target.value }))}
        >
          {projects.map((project) => (
            <MenuItem key={project.id} value={project.id}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Avatar
                  variant="rounded"
                  sx={{
                    width: 16,
                    height: 16,
                    bgcolor: project.color ?? "primary.main",
                    color: "common.white",
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  {renderProjectIcon(project.icon ?? undefined, 10)}
                </Avatar>
                {project.name}
              </Box>
            </MenuItem>
          ))}
        </TextField>
      </Box>

      {/* Node */}
      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
          {t("scheduledJob.form.node")}
        </Typography>
        {nodesError ? (
          <Typography variant="caption" color="error">
            {nodesError}
          </Typography>
        ) : (
          <TextField
            select
            size="small"
            fullWidth
            disabled={isCreating || isNodesLoading || nodes.length === 0}
            value={draft.nodeId}
            onChange={(e) => setDraft((prev) => ({ ...prev, nodeId: e.target.value }))}
            slotProps={{
              input: {
                endAdornment: isNodesLoading ? <CircularProgress size={14} sx={{ mr: 2 }} /> : undefined,
              },
            }}
          >
            {nodes.map((node) => (
              <MenuItem key={node.id} value={node.id}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Box component="span" sx={{ display: "inline-flex", color: "text.secondary" }}>
                    {node.scope === "shared" ? <LuCloud size={14} /> : <LuServer size={14} />}
                  </Box>
                  {node.name}
                </Box>
              </MenuItem>
            ))}
          </TextField>
        )}
      </Box>

      {/* Agent */}
      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
          {t("scheduledJob.form.agentKind")}
        </Typography>
        <TextField
          select
          size="small"
          fullWidth
          disabled={isCreating}
          value={draft.agentKind}
          onChange={(e) => setDraft((prev) => ({ ...prev, agentKind: e.target.value as DesktopAgentKind }))}
        >
          {SUPPORTED_DESKTOP_AGENT_KINDS.map((agentKind) => (
            <MenuItem key={agentKind} value={agentKind}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <AgentIcon agentKind={agentKind} context="settingsRow" decorative />
                {t(AGENT_SETTINGS_LABEL_KEY_BY_KIND[agentKind])}
              </Box>
            </MenuItem>
          ))}
        </TextField>
      </Box>

      {/* Cron expression */}
      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
          {t("scheduledJob.form.cronExpression")}
        </Typography>
        <TextField
          size="small"
          fullWidth
          disabled={isCreating}
          value={draft.cronExpression}
          onChange={(e) => setDraft((prev) => ({ ...prev, cronExpression: e.target.value }))}
          placeholder={t("scheduledJob.form.cronExpressionPlaceholder")}
        />
      </Box>

      {/* Timezone */}
      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
          {t("scheduledJob.form.timezone")}
        </Typography>
        <Autocomplete
          options={TIMEZONE_OPTIONS}
          value={draft.timezone}
          onChange={(_, value) => setDraft((prev) => ({ ...prev, timezone: value ?? "UTC" }))}
          disabled={isCreating}
          size="small"
          autoHighlight
          ListboxComponent={VirtualizedListbox}
          renderInput={(params) => <TextField {...params} size="small" placeholder="UTC" />}
        />
      </Box>

      {/* Prompt */}
      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
          {t("scheduledJob.form.prompt")}
        </Typography>
        <TextField
          size="small"
          fullWidth
          multiline
          minRows={3}
          maxRows={8}
          disabled={isCreating}
          value={draft.prompt}
          onChange={(e) => setDraft((prev) => ({ ...prev, prompt: e.target.value }))}
          placeholder={t("scheduledJob.form.promptPlaceholder")}
        />
      </Box>

      {/* Submit error */}
      {createMutation.isError ? (
        <Typography variant="caption" color="error">
          {getErrorMessage(createMutation.error)}
        </Typography>
      ) : null}

      {/* Actions */}
      <Stack direction="row" spacing={1} justifyContent="flex-end">
        {onCancel ? (
          <Button onClick={onCancel} disabled={isCreating}>
            {t("common.actions.cancel")}
          </Button>
        ) : null}
        <Button
          type="submit"
          variant="contained"
          disabled={isSubmitDisabled}
          startIcon={isCreating ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {isCreating ? t("scheduledJob.form.creating") : t("scheduledJob.form.submit")}
        </Button>
      </Stack>
    </Stack>
  );
}
