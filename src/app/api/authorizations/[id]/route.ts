import { z } from "zod";
import { ApiError, assertPermission, errorResponse, requireSession } from "@/server/access";
import { decideAuthorization } from "@/server/authorizations";

const schema = z.object({
  action: z.enum(["APPROVE", "REJECT"], { message: "Select an action." }),
  remarks: z.string().trim().max(500).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSession();
    assertPermission(user, "authorizations:approve");
    const { id } = await params;

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(422, "VALIDATION", parsed.error.issues[0]?.message ?? "Check the submitted values.");
    }

    const authorization = decideAuthorization(user, id, parsed.data);
    return Response.json({
      authorization,
      message:
        parsed.data.action === "APPROVE"
          ? `${authorization.ref} approved.`
          : `${authorization.ref} rejected.`,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export const runtime = "nodejs";
