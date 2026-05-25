import {
  Alert,
  Box,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuArrowLeftRight } from "react-icons/lu";
import { CenteredSpinner } from "../../components/CenteredSpinner";
import { ConfirmationDialog } from "../../components/ConfirmationDialog";
import { StatusIndicator } from "../../components/StatusIndicator";
import { SettingsCard, SettingsSectionHeader } from "../../components/settings";
import { api } from "../../api/client";
import type { NodeRecord, OrganizationMemberRecord } from "../../api/types";
import { sessionStore } from "../../store/sessionStore";
import { getErrorMessage } from "../../helpers/errorHelpers";

function resolveOwnerLabel(node: NodeRecord, members: OrganizationMemberRecord[], fallbackLabel: string): string {
  if (!node.ownerUserId) {
    return fallbackLabel;
  }

  const member = members.find((entry) => entry.userId === node.ownerUserId);
  if (!member) {
    return fallbackLabel;
  }

  return member.name?.trim() || member.email;
}

function resolveNodeVersion(node: NodeRecord, fallbackLabel: string): string {
  const version = node.metadata?.version;
  return typeof version === "string" && version.trim() ? version : fallbackLabel;
}

function resolveNodeTypeLabel(node: NodeRecord, privateLabel: string, sharedLabel: string): string {
  return node.scope === "shared" ? sharedLabel : privateLabel;
}

type ScopeChangeTarget = {
  node: NodeRecord;
  newScope: "private" | "shared";
};

export function NodesSettingsView() {
  const { t } = useTranslation();
  const selectedOrganizationId = sessionStore((state) => state.selectedOrganizationId);
  const organizations = sessionStore((state) => state.organizations);
  const currentUserId = sessionStore((state) => state.currentUser?.id);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [nodes, setNodes] = useState<NodeRecord[]>([]);
  const [members, setMembers] = useState<OrganizationMemberRecord[]>([]);
  const [scopeChangeTarget, setScopeChangeTarget] = useState<ScopeChangeTarget | null>(null);
  const [isScopeChanging, setIsScopeChanging] = useState(false);
  const [scopeChangeError, setScopeChangeError] = useState<string | null>(null);

  const organizationId = selectedOrganizationId ?? organizations[0]?.id;

  const currentUserRole = organizations
    .find((o) => o.id === organizationId)
    ?.members?.find((m) => m.userId === currentUserId)?.role;

  useEffect(() => {
    if (!organizationId) {
      setNodes([]);
      setMembers([]);
      setHasLoadError(false);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setHasLoadError(false);

      try {
        const [nextNodes, nextMembers] = await Promise.all([
          api.node.listByOrg(organizationId),
          api.org.listMembers(organizationId),
        ]);

        if (cancelled) {
          return;
        }

        setNodes(nextNodes);
        setMembers(nextMembers);
      } catch (error) {
        console.error("[NodesSettingsView] Failed to load organization nodes", error);
        if (!cancelled) {
          setNodes([]);
          setMembers([]);
          setHasLoadError(true);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [organizations, selectedOrganizationId]);

  function canChangeScope(node: NodeRecord): boolean {
    if (node.scope === "private") {
      // Only the owner may promote their private node to shared.
      return node.ownerUserId === currentUserId;
    }
    // Shared nodes: only admins and owners can demote back to private.
    return currentUserRole === "owner" || currentUserRole === "admin";
  }

  function handleScopeChangeRequest(node: NodeRecord) {
    const newScope: "private" | "shared" = node.scope === "private" ? "shared" : "private";
    setScopeChangeError(null);
    setScopeChangeTarget({ node, newScope });
  }

  async function handleScopeChangeConfirm() {
    if (!scopeChangeTarget || !organizationId) {
      return;
    }

    setIsScopeChanging(true);
    setScopeChangeError(null);

    try {
      const updated = await api.node.updateScope(organizationId, scopeChangeTarget.node.id, scopeChangeTarget.newScope);
      setNodes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      setScopeChangeTarget(null);
    } catch (error) {
      setScopeChangeError(getErrorMessage(error));
    } finally {
      setIsScopeChanging(false);
    }
  }

  function handleScopeChangeCancel() {
    if (isScopeChanging) {
      return;
    }
    setScopeChangeTarget(null);
    setScopeChangeError(null);
  }

  const confirmDialogDescription = scopeChangeTarget
    ? scopeChangeTarget.newScope === "shared"
      ? t("settings.nodes.scopeChangeDialog.toSharedDescription", { name: scopeChangeTarget.node.name })
      : t("settings.nodes.scopeChangeDialog.toPrivateDescription", { name: scopeChangeTarget.node.name })
    : "";

  return (
    <Box>
      <SettingsSectionHeader title={t("settings.nodes.title")} description={t("settings.nodes.description")} />
      <SettingsCard>
        {isLoading ? (
          <CenteredSpinner />
        ) : (
          <>
            {hasLoadError ? <Alert severity="error">{t("settings.nodes.loadError")}</Alert> : null}
            {scopeChangeError ? (
              <Alert severity="error" sx={{ mt: hasLoadError ? 1 : 0, mb: 1.5 }}>
                {scopeChangeError}
              </Alert>
            ) : null}
            <Table
              size="small"
              sx={{
                mt: hasLoadError || scopeChangeError ? 1.5 : 0,
                "& th": {
                  fontWeight: 600,
                  borderBottomColor: "divider",
                },
                "& th, & td": {
                  borderBottomColor: "divider",
                },
                "& tbody tr:last-of-type td": {
                  borderBottom: "none",
                },
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell>{t("settings.nodes.columns.name")}</TableCell>
                  <TableCell>{t("settings.nodes.columns.type")}</TableCell>
                  <TableCell>{t("settings.nodes.columns.version")}</TableCell>
                  <TableCell>{t("settings.nodes.columns.owner")}</TableCell>
                  <TableCell>{t("settings.nodes.columns.status")}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {nodes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                        {t("settings.nodes.empty")}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  nodes.map((node) => (
                    <TableRow key={node.id}>
                      <TableCell>{node.name}</TableCell>
                      <TableCell>
                        {resolveNodeTypeLabel(
                          node,
                          t("settings.nodes.types.private"),
                          t("settings.nodes.types.shared"),
                        )}
                      </TableCell>
                      <TableCell>{resolveNodeVersion(node, t("settings.nodes.values.unknownVersion"))}</TableCell>
                      <TableCell>{resolveOwnerLabel(node, members, t("settings.nodes.values.unknownOwner"))}</TableCell>
                      <TableCell>
                        <StatusIndicator
                          label={node.isOnline ? t("settings.nodes.status.online") : t("settings.nodes.status.offline")}
                          color={node.isOnline ? "success" : "disabled"}
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ pr: 0.5 }}>
                        {canChangeScope(node) ? (
                          <Tooltip
                            title={
                              node.scope === "private"
                                ? t("settings.nodes.actions.makeShared")
                                : t("settings.nodes.actions.makePrivate")
                            }
                          >
                            <IconButton
                              size="small"
                              onClick={() => handleScopeChangeRequest(node)}
                              aria-label={
                                node.scope === "private"
                                  ? t("settings.nodes.actions.makeShared")
                                  : t("settings.nodes.actions.makePrivate")
                              }
                            >
                              <LuArrowLeftRight size={14} />
                            </IconButton>
                          </Tooltip>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </>
        )}
      </SettingsCard>

      <ConfirmationDialog
        open={scopeChangeTarget !== null}
        title={t("settings.nodes.scopeChangeDialog.title")}
        description={confirmDialogDescription}
        confirmLabel={t("settings.nodes.scopeChangeDialog.confirm")}
        confirmColor="warning"
        isSubmitting={isScopeChanging}
        onCancel={handleScopeChangeCancel}
        onConfirm={() => void handleScopeChangeConfirm()}
      />
    </Box>
  );
}
