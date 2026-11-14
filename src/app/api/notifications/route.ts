import { errorResponse } from "@/server/access";
import { getNotifications, markNotificationsRead } from "@/server/search";

export async function GET() {
  try {
    const { items } = await getNotifications();
    return Response.json({ items });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    await markNotificationsRead(typeof body?.id === "string" ? body.id : undefined);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export const runtime = "nodejs";
