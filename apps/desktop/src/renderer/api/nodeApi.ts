import { requestJson } from "./restClient";
import type { NodeRecord } from "./types";

/** Lists nodes available to one organization member. */
export async function listOrganizationNodes(orgId: string): Promise<NodeRecord[]> {
  const response = await requestJson<{ nodes: NodeRecord[] }>(`/orgs/${orgId}/nodes`);
  return response.nodes;
}

/** Updates the scope (private / shared) of one node. */
export async function updateOrganizationNodeScope(
  orgId: string,
  nodeId: string,
  scope: "private" | "shared",
): Promise<NodeRecord> {
  const response = await requestJson<{ node: NodeRecord }>(`/orgs/${orgId}/nodes/${nodeId}/scope`, {
    method: "PATCH",
    body: { scope },
  });
  return response.node;
}
