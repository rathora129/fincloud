import { ApiError, clientIp, errorResponse, requireSession } from "@/server/access";
import { updateRoleDefinition, type RoleUpdateInput } from "@/server/access-control";
import { roleUpdateSchema } from "@/lib/validation/access";
import type { Permission } from "@/lib/types";

export async function PATCH(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const user = await requireSession();
    const { code } = await params;
    const body = await request.json().catch(() => null);
    const parsed = roleUpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(422, "VALIDATION", parsed.error.issues[0]?.message ?? "Invalid role definition.");
    }
    const input: RoleUpdateInput = {
      ...parsed.data,
      permissions: parsed.data.permissions as Permission[],
    };
    const role = updateRoleDefinition(user, code, input, clientIp(request));
    return Response.json({ role });
  } catch (error) {
    return errorResponse(error);
  }
}

export const runtime = "nodejs";
