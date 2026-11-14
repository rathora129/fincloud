import { ApiError, assertPermission, buildScope, errorResponse, requireSession } from "@/server/access";
import { grievanceUpdateSchema, updateGrievance } from "@/server/operations";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSession();
    assertPermission(user, "operations:manage");

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = grievanceUpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(422, "VALIDATION", parsed.error.issues[0]?.message ?? "Invalid grievance update.");
    }

    const scope = buildScope(user);
    const grievance = updateGrievance(scope, user, id, parsed.data);
    return Response.json({ grievance });
  } catch (error) {
    return errorResponse(error);
  }
}

export const runtime = "nodejs";
