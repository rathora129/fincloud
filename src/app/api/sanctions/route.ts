import { ApiError, assertPermission, buildScope, errorResponse, requireSession } from "@/server/access";
import { createSanction } from "@/server/sanctions";
import { sanctionCreateSchema } from "@/lib/validation/sanctions";

export async function POST(request: Request) {
  try {
    const user = await requireSession();
    assertPermission(user, "sanctions:decide");

    const body = await request.json().catch(() => null);
    const parsed = sanctionCreateSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ApiError(422, "VALIDATION_ERROR", issue?.message ?? "Invalid sanction payload.");
    }

    const scope = buildScope(user);
    const result = createSanction(user, scope, parsed.data);
    return Response.json({ item: result }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export const runtime = "nodejs";
