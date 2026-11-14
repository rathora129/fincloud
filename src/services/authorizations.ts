import { patchJson, postJson } from "@/lib/api";
import type { AuthorizationRequest } from "@/lib/types";
import type { CreateAuthorizationInput, DecideAuthorizationInput } from "@/server/authorizations";

export type AuthorizationMutationResult = { authorization: AuthorizationRequest; message: string };

export const authorizationsService = {
  create(input: CreateAuthorizationInput) {
    return postJson<AuthorizationMutationResult>("/authorizations", input);
  },
  decide(authorizationId: string, input: DecideAuthorizationInput) {
    return patchJson<AuthorizationMutationResult>(`/authorizations/${authorizationId}`, input);
  },
};
