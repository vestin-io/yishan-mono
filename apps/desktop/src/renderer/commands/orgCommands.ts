import { api } from "../api";
import { getErrorMessage } from "../helpers/errorHelpers";
import { sessionStore } from "../store/sessionStore";

/**
 * Adds a member to the currently selected organization by their email address.
 *
 * Throws with a human-readable message when the selected org is missing,
 * when the caller lacks permission, or when no user exists with that email.
 */
export async function addOrgMember(email: string, role: "member" | "admin" = "member"): Promise<void> {
  const orgId = sessionStore.getState().selectedOrganizationId;

  if (!orgId) {
    throw new Error("No organization selected.");
  }

  try {
    await api.org.addMember(orgId, email, role);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}
