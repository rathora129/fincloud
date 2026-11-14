import { ApiError, assertPermission, buildScope, errorResponse, requireSession } from "@/server/access";
import { setUserStatus, updateUserRecord, updateUserSchema } from "@/server/users";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSession();
    assertPermission(user, "users:manage");

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = updateUserSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(422, "VALIDATION", parsed.error.issues[0]?.message ?? "Invalid user update.");
    }

    const scope = buildScope(user);

    if (parsed.data.action === "SET_STATUS") {
      const updated = setUserStatus(user, scope, id, parsed.data.status);
      return Response.json({ user: updated });
    }

    const { action: _action, ...fields } = parsed.data;
    const updated = updateUserRecord(user, scope, id, fields);
    return Response.json({ user: updated });
  } catch (error) {
    return errorResponse(error);
  }
}

export const runtime = "nodejs";
