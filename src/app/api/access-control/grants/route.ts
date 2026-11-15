import { ApiError, assertPermission, clientIp, errorResponse, requireSession } from "@/server/access";
import { createGrant, type GrantInput } from "@/server/access-control";
import { grantSchema } from "@/lib/validation/access";
import type { Permission } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const user = await requireSession();
    assertPermission(user, "access:manage");
    const body = await request.json().catch(() => null);
    const parsed = grantSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(422, "VALIDATION", parsed.error.issues[0]?.message ?? "Invalid access grant.");
    }

    const input: GrantInput = {
      ...parsed.data,
      permission: parsed.data.permission as Permission,
      expiresAt: parsed.data.expiresAt || null,
    };
    const grant = createGrant(user, input, clientIp(request));
    return Response.json({ grant }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export const runtime = "nodejs";
