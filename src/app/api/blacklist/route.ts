import { ApiError, assertPermission, buildScope, errorResponse, requireSession } from "@/server/access";
import { addBlacklistEntry, blacklistInputSchema } from "@/server/operations";

export async function POST(request: Request) {
  try {
    const user = await requireSession();
    assertPermission(user, "operations:manage");

    const body = await request.json().catch(() => null);
    const parsed = blacklistInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(422, "VALIDATION", parsed.error.issues[0]?.message ?? "Invalid blacklist entry.");
    }

    const scope = buildScope(user);
    const entry = addBlacklistEntry(scope, user, parsed.data);
    return Response.json({ entry }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export const runtime = "nodejs";
