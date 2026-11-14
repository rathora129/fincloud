import { assertPermission, errorResponse, requireSession } from "@/server/access";
import { createApplication, getApplicationsWorkspace } from "@/server/applications";
import { applicationCreateSchema } from "@/lib/validation/applications";

export async function GET(request: Request) {
  try {
    const user = await requireSession();
    assertPermission(user, "applications:view");
    const params = new URL(request.url).searchParams;
    const data = getApplicationsWorkspace(user, {
      tab: params.get("tab") ?? undefined,
      q: params.get("q") ?? undefined,
      status: params.get("status") ?? undefined,
      product: params.get("product") ?? undefined,
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
    const parsed = applicationCreateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: { code: "VALIDATION", message: "Please correct the highlighted fields.", fields: parsed.error.flatten().fieldErrors } },
        { status: 422 },
      );
    }
    const created = createApplication(user, parsed.data);
    return Response.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export const runtime = "nodejs";
