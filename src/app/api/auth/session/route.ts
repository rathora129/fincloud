import { getSessionUser } from "@/server/session";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: { code: "UNAUTHENTICATED", message: "No active session." } }, { status: 401 });
  }
  return Response.json({ user });
}

export const runtime = "nodejs";
