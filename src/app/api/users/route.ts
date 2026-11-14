import { ApiError, assertPermission, buildScope, errorResponse, requireSession } from "@/server/access";
import { createUserRecord, createUserSchema } from "@/server/users";

export async function POST(request: Request) {
  try {
    const user = await requireSession();
    assertPermission(user, "users:manage");

    const body = await request.json().catch(() => null);
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(422, "VALIDATION", parsed.error.issues[0]?.message ?? "Invalid user details.");
    }

    const scope = buildScope(user);
    const created = createUserRecord(user, scope, parsed.data);
    return Response.json({ user: created }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export const runtime = "nodejs";
