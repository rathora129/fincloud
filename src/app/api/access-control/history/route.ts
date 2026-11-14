import { errorResponse, requireSession } from "@/server/access";
import { getPermissionHistory } from "@/server/access-control";

export async function GET(request: Request) {
  try {
    const user = await requireSession();
    const url = new URL(request.url);
    const target = url.searchParams.get("target") ?? undefined;
    return Response.json({ audits: getPermissionHistory(user, target) });
  } catch (error) {
    return errorResponse(error);
  }
}

export const runtime = "nodejs";
