import { z } from "zod";
import { ApiError, assertPermission, errorResponse, requireSession } from "@/server/access";
import { recordCollectionRepayment } from "@/server/collections";

const schema = z.object({
  mode: z.enum(["NACH", "UPI", "NEFT", "CASH"], { message: "Select a valid payment mode." }),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSession();
    assertPermission(user, "collections:manage");
    const { id } = await params;

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(422, "VALIDATION", parsed.error.issues[0]?.message ?? "Select a valid payment mode.");
    }

    const result = recordCollectionRepayment(user, id, parsed.data);
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export const runtime = "nodejs";
