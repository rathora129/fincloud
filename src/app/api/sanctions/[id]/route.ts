import { z } from "zod";
import { ApiError, assertPermission, buildScope, errorResponse, requireSession } from "@/server/access";
import { applySanctionAction } from "@/server/sanctions";

const actionSchema = z.object({
  action: z.enum(["ACCEPT", "APPROVE", "REJECT"]),
  remarks: z.string().trim().max(600, "Remarks must be 600 characters or fewer.").optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSession();
    assertPermission(user, "sanctions:decide");
    const { id } = await params;

    const body = await request.json().catch(() => null);
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ApiError(422, "VALIDATION_ERROR", issue?.message ?? "Invalid sanction action payload.");
    }

    const scope = buildScope(user);
    const result = applySanctionAction(user, scope, id, parsed.data);
    return Response.json({ item: result });
  } catch (error) {
    return errorResponse(error);
  }
}

export const runtime = "nodejs";
