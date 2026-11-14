import { errorResponse, requireSession } from "@/server/access";
import { getAccessCenterData } from "@/server/access-control";

export async function GET() {
  try {
    const user = await requireSession();
    return Response.json(getAccessCenterData(user));
  } catch (error) {
    return errorResponse(error);
  }
}

export const runtime = "nodejs";
