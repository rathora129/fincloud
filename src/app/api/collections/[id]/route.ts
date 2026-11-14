import { z } from "zod";
import { ApiError, assertPermission, errorResponse, requireSession } from "@/server/access";
import { applyCollectionAction } from "@/server/collections";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("LOG_CONTACT"),
    note: z.string().trim().min(3, "Add a short note (at least 3 characters).").max(500),
    nextActionAt: z.string().trim().optional().nullable(),
  }),
  z.object({
    action: z.literal("SET_PTP"),
    ptpAmount: z.coerce.number().positive("Promise amount must be greater than zero."),
    ptpDate: z.string().trim().min(1, "Select a promise date."),
  }),
  z.object({
    action: z.literal("MOVE_STATUS"),
    status: z.enum(["RECOVERY", "LEGAL"]),
  }),
  z.object({
    action: z.literal("RESOLVE"),
    note: z.string().trim().min(5, "Add a resolution note (at least 5 characters).").max(500),
  }),
]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSession();
    assertPermission(user, "collections:manage");
    const { id } = await params;

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(422, "VALIDATION", parsed.error.issues[0]?.message ?? "Check the submitted values.");
    }

    const result = applyCollectionAction(user, id, parsed.data);
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export const runtime = "nodejs";
