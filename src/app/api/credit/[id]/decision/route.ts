import { z } from "zod";
import { ApiError, assertPermission, buildScope, errorResponse, requireSession } from "@/server/access";
import { applyCreditDecision } from "@/server/credit";

const decisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT", "SEND_BACK"]),
  approvedAmount: z.coerce.number().finite().positive().optional(),
  riskBand: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  remarks: z.string().trim().max(600, "Remarks must be 600 characters or fewer.").optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSession();
    assertPermission(user, "credit:decide");
    const { id } = await params;

    const body = await request.json().catch(() => null);
    const parsed = decisionSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ApiError(422, "VALIDATION_ERROR", issue?.message ?? "Invalid credit decision payload.");
    }

    const scope = buildScope(user);
    const result = applyCreditDecision(user, scope, id, parsed.data);
    return Response.json({ item: result });
  } catch (error) {
    return errorResponse(error);
  }
}

export const runtime = "nodejs";
