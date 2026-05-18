/**
 * Canonical list of supported AI agent kinds shared across all yishan apps.
 *
 * - `api-service` uses this as `ScheduledAgentKind` for scheduled-job DB records.
 * - `desktop` uses this as `DesktopAgentKind` for UI agent selection and settings.
 *
 * Add new agent kinds here only — do not duplicate this list in individual apps.
 */
export const AGENT_KINDS = ["opencode", "codex", "claude", "gemini", "pi", "copilot", "cursor"] as const;

/** Union type of all supported agent kind identifiers. */
export type AgentKind = (typeof AGENT_KINDS)[number];
