import { ApiError, clientIp, errorResponse, requireSession } from "@/server/access";
import { revokeGrant } from "@/server/access-control";
import { revokeGrantSchema } from "@/lib/validation/access";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSession();
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = revokeGrantSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(422, "VALIDATION", parsed.error.issues[0]?.message ?? "Invalid revocation.");
    }
    const grant = revokeGrant(user, id, parsed.data.reason, clientIp(request));
    return Response.json({ grant });
  } catch (error) {
    return errorResponse(error);
  }
}

export const runtime = "nodejs";
