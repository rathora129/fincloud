import { z } from "zod";
import { ApiError, assertPermission, buildScope, errorResponse, requireSession } from "@/server/access";
import { applyDisbursementAction } from "@/server/disbursements";

const actionSchema = z.object({
  action: z.enum(["PROCESS", "RECOMMEND", "AUTHORIZE", "COMPLETE", "REJECT"]),
  remarks: z.string().trim().max(600, "Remarks must be 600 characters or fewer.").optional(),
});

const APPROVAL_ACTIONS = new Set(["COMPLETE", "REJECT"]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSession();
    assertPermission(user, "disbursements:view");
    const { id } = await params;

    const body = await request.json().catch(() => null);
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ApiError(422, "VALIDATION_ERROR", issue?.message ?? "Invalid disbursement action payload.");
    }

    const permission = APPROVAL_ACTIONS.has(parsed.data.action) ? "disbursements:approve" : "disbursements:process";
    assertPermission(user, permission);

    const scope = buildScope(user);
    const result = applyDisbursementAction(user, scope, id, parsed.data);
    return Response.json({ item: result });
  } catch (error) {
    return errorResponse(error);
  }
}

export const runtime = "nodejs";
