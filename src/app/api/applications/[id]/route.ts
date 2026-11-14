import { assertPermission, errorResponse, requireSession } from "@/server/access";
import {
  getApplicationDetail,
  recommendApplication,
  resubmitApplication,
  submitApplication,
  updateApplication,
  updateDocument,
  updateVerification,
} from "@/server/applications";
import { applicationActionSchema } from "@/lib/validation/applications";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireSession();
    assertPermission(user, "applications:view");
    const { id } = await context.params;
    return Response.json(getApplicationDetail(user, id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireSession();
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    const parsed = applicationActionSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: { code: "VALIDATION", message: "Please correct the highlighted fields.", fields: parsed.error.flatten().fieldErrors } },
        { status: 422 },
      );
    }
    const payload = parsed.data;

    switch (payload.action) {
      case "UPDATE":
        return Response.json(updateApplication(user, id, payload.patch));
      case "SUBMIT":
        return Response.json(submitApplication(user, id));
      case "DOCUMENT":
        return Response.json(updateDocument(user, id, payload.documentId, payload.status));
      case "VERIFICATION":
        return Response.json(updateVerification(user, id, payload.field, payload.status));
      case "RECOMMEND":
        return Response.json(recommendApplication(user, id, payload.creditOfficerId));
      case "RESUBMIT":
        return Response.json(resubmitApplication(user, id));
    }
  } catch (error) {
    return errorResponse(error);
  }
}

export const runtime = "nodejs";
