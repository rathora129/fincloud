import { assertPermission, errorResponse, requireSession } from "@/server/access";
import { createLead, getLeadsWorkspace } from "@/server/leads";
import { leadCreateSchema } from "@/lib/validation/leads";

export async function GET(request: Request) {
  try {
    const user = await requireSession();
    assertPermission(user, "leads:view");
    const params = new URL(request.url).searchParams;
    const data = getLeadsWorkspace(user, {
      tab: params.get("tab") ?? undefined,
      q: params.get("q") ?? undefined,
      status: params.get("status") ?? undefined,
      source: params.get("source") ?? undefined,
      ownerId: params.get("owner") ?? undefined,
      branchId: params.get("branch") ?? undefined,
      from: params.get("from") ?? undefined,
      to: params.get("to") ?? undefined,
    });
    return Response.json(data);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSession();
    const body = await request.json().catch(() => null);
    const parsed = leadCreateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: { code: "VALIDATION", message: "Please correct the highlighted fields.", fields: parsed.error.flatten().fieldErrors } },
        { status: 422 },
      );
    }
    const input = parsed.data;
    const created = createLead(user, {
      ...input,
      notes: input.notes ?? "",
      nextFollowUpAt: input.nextFollowUpAt || undefined,
    });
    return Response.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export const runtime = "nodejs";
