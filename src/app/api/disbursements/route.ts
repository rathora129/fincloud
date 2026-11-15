import { ApiError, assertPermission, buildScope, errorResponse, requireSession } from "@/server/access";
import { createDisbursement } from "@/server/disbursements";
import { disbursementCreateSchema } from "@/lib/validation/disbursements";

export async function POST(request: Request) {
  try {
    const user = await requireSession();
    assertPermission(user, "disbursements:process");

    const body = await request.json().catch(() => null);
    const parsed = disbursementCreateSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ApiError(422, "VALIDATION_ERROR", issue?.message ?? "Invalid disbursement payload.");
    }

    const scope = buildScope(user);
    const result = createDisbursement(user, scope, parsed.data);
    return Response.json({ item: result }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export const runtime = "nodejs";
