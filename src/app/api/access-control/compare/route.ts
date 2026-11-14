import { ApiError, errorResponse, requireSession } from "@/server/access";
import { compareUserAccess } from "@/server/access-control";

export async function GET(request: Request) {
  try {
    const user = await requireSession();
    const url = new URL(request.url);
    const left = url.searchParams.get("left");
    const right = url.searchParams.get("right");
    if (!left || !right) {
      throw new ApiError(422, "VALIDATION", "Select two users to compare.");
    }
    return Response.json(compareUserAccess(user, left, right));
  } catch (error) {
    return errorResponse(error);
  }
}

export const runtime = "nodejs";
