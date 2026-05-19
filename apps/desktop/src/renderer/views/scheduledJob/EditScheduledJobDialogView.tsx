import {
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import React, { forwardRef, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ScheduledJobRecord } from "../../api/scheduledJobApi";
import { AgentIcon } from "../../components/AgentIcon";
import {
  AGENT_SETTINGS_LABEL_KEY_BY_KIND,
  type DesktopAgentKind,
  SUPPORTED_DESKTOP_AGENT_KINDS,
  isDesktopAgentKind,
} from "../../helpers/agentSettings";
import { getErrorMessage } from "../../helpers/errorHelpers";
import { useCommands } from "../../hooks/useCommands";
import { useDialogRegistration } from "../../hooks/useDialogRegistration";

// ---------------------------------------------------------------------------
// Virtualised listbox (same pattern as CreateScheduledJobFormView)
// ---------------------------------------------------------------------------

const ITEM_HEIGHT = 36;
const MAX_VISIBLE_ITEMS = 8;

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
// IANA timezones
// ---------------------------------------------------------------------------

const TIMEZONE_OPTIONS: string[] =
  typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["UTC"];

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

type EditScheduledJobDialogViewProps = {
  job: ScheduledJobRecord;
  open: boolean;
  onClose: () => void;
};

type FormDraft = {
  name: string;
  agentKind: DesktopAgentKind;
  cronExpression: string;
  timezone: string;
  prompt: string;
};

/** Dialog for editing an existing scheduled job's mutable fields. */
export function EditScheduledJobDialogView({ job, open, onClose }: EditScheduledJobDialogViewProps) {
  const { t } = useTranslation();
  const { updateScheduledJob } = useCommands();
  useDialogRegistration(open);

  const [draft, setDraft] = useState<FormDraft>(() => ({
    name: job.name,
    agentKind: isDesktopAgentKind(job.agentKind) ? job.agentKind : "opencode",
    cronExpression: job.cronExpression,
    timezone: job.timezone,
    prompt: job.prompt,
  }));

  // Re-sync draft when the dialog opens with a (possibly updated) job.
  useEffect(() => {
    if (open) {
      setDraft({
        name: job.name,
        agentKind: isDesktopAgentKind(job.agentKind) ? job.agentKind : "opencode",
        cronExpression: job.cronExpression,
        timezone: job.timezone,
        prompt: job.prompt,
      });
    }
  }, [open, job]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      await updateScheduledJob(job.id, {
        name: draft.name.trim(),
        agentKind: draft.agentKind,
        cronExpression: draft.cronExpression.trim(),
        timezone: draft.timezone.trim() || "UTC",
        prompt: draft.prompt.trim(),
      });
    },
    onSuccess: () => {
      onClose();
    },
  });

  const isSaving = updateMutation.isPending;

  const isSubmitDisabled = isSaving || !draft.name.trim() || !draft.cronExpression.trim() || !draft.prompt.trim();

  const handleClose = () => {
    if (isSaving) return;
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm" disableEscapeKeyDown={isSaving}>
      <DialogTitle>{t("scheduledJob.edit.title")}</DialogTitle>
      <DialogContent sx={{ pb: 2.5 }}>
        <Stack
          spacing={2}
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!isSubmitDisabled) updateMutation.mutate();
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
              disabled={isSaving}
              value={draft.name}
              onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
            />
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
              disabled={isSaving}
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
              disabled={isSaving}
              value={draft.cronExpression}
              onChange={(e) => setDraft((prev) => ({ ...prev, cronExpression: e.target.value }))}
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
              disabled={isSaving}
              size="small"
              autoHighlight
              ListboxComponent={VirtualizedListbox}
              renderInput={(params) => <TextField {...params} size="small" />}
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
              disabled={isSaving}
              value={draft.prompt}
              onChange={(e) => setDraft((prev) => ({ ...prev, prompt: e.target.value }))}
            />
          </Box>

          {updateMutation.isError ? (
            <Typography variant="caption" color="error">
              {getErrorMessage(updateMutation.error)}
            </Typography>
          ) : null}

          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button onClick={handleClose} disabled={isSaving}>
              {t("common.actions.cancel")}
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={isSubmitDisabled}
              startIcon={isSaving ? <CircularProgress size={14} color="inherit" /> : undefined}
            >
              {isSaving ? t("common.actions.saving") : t("scheduledJob.edit.save")}
            </Button>
          </Stack>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
