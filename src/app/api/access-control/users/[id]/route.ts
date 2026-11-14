import { ApiError, clientIp, errorResponse, requireSession } from "@/server/access";
import { getUserAccess, previewEffectivePermissions, updateUserScope } from "@/server/access-control";
import { userScopeSchema } from "@/lib/validation/access";
import type { RecordType } from "@/lib/types";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSession();
    const { id } = await params;
    const url = new URL(request.url);
    const branchId = url.searchParams.get("branchId") ?? undefined;
    const department = url.searchParams.get("department") ?? undefined;
    const recordType = (url.searchParams.get("recordType") ?? undefined) as RecordType | undefined;
    const recordId = url.searchParams.get("recordId") ?? undefined;

    if (branchId || department || (recordType && recordId)) {
      return Response.json(
        previewEffectivePermissions(user, id, { branchId, department, recordType, recordId }),
      );
    }
    return Response.json(getUserAccess(user, id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSession();
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = userScopeSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(422, "VALIDATION", parsed.error.issues[0]?.message ?? "Invalid scope update.");
    }
    const summary = updateUserScope(user, id, parsed.data, clientIp(request));
    return Response.json({ user: summary });
  } catch (error) {
    return errorResponse(error);
  }
}

export const runtime = "nodejs";
