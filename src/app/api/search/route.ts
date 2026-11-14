import { errorResponse } from "@/server/access";
import { searchAll } from "@/server/search";

export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams.get("q") ?? "";
    const result = await searchAll(q);
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export const runtime = "nodejs";
