import { ApiError, assertPermission, clientIp, errorResponse, requireSession } from "@/server/access";
import { createRoleDefinition, type RoleCreateInput } from "@/server/access-control";
import { roleCreateSchema } from "@/lib/validation/access";
import type { Permission } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const user = await requireSession();
    assertPermission(user, "roles:manage");
    const body = await request.json().catch(() => null);
    const parsed = roleCreateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(422, "VALIDATION", parsed.error.issues[0]?.message ?? "Invalid role definition.");
    }
    const input: RoleCreateInput = {
      ...parsed.data,
      permissions: parsed.data.permissions as Permission[],
    };
    const role = createRoleDefinition(user, input, clientIp(request));
    return Response.json({ role }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export const runtime = "nodejs";
