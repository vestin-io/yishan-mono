import { requestJson } from "./restClient";
import type { OrganizationMemberRecord, OrganizationRecord } from "./types";

/** Lists organizations visible to the signed-in user. */
export async function listOrganizations(): Promise<OrganizationRecord[]> {
  const response = await requestJson<{ organizations: OrganizationRecord[] }>("/orgs");
  return response.organizations;
}

/** Creates one organization. */
export async function createOrganization(name: string): Promise<OrganizationRecord> {
  const response = await requestJson<{ organization: OrganizationRecord }>("/orgs", {
    method: "POST",
    body: { name },
  });

  return response.organization;
}

/** Lists members for one organization visible to the signed-in user. */
export async function listOrganizationMembers(orgId: string): Promise<OrganizationMemberRecord[]> {
  const response = await requestJson<{ members: OrganizationMemberRecord[] }>(`/orgs/${orgId}/members`);
  return response.members;
}

/** Adds a member to an organization by their email address. Caller must be owner or admin. */
export async function addOrganizationMember(
  orgId: string,
  email: string,
  role: "member" | "admin" = "member",
): Promise<OrganizationMemberRecord> {
  const response = await requestJson<{ member: OrganizationMemberRecord }>(`/orgs/${orgId}/members`, {
    method: "POST",
    body: { email, role },
  });
  return response.member;
}
