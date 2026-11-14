import { ApiError, assertPermission, errorResponse, requireSession } from "@/server/access";
import { addFollowUp, assignLead, changeLeadStatus, convertLead, getLeadDetail, updateLead } from "@/server/leads";
import { leadActionSchema } from "@/lib/validation/leads";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireSession();
    assertPermission(user, "leads:view");
    const { id } = await context.params;
    return Response.json(getLeadDetail(user, id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireSession();
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    const parsed = leadActionSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: { code: "VALIDATION", message: "Please correct the highlighted fields.", fields: parsed.error.flatten().fieldErrors } },
        { status: 422 },
      );
    }
    const payload = parsed.data;

    switch (payload.action) {
      case "UPDATE": {
        const { nextFollowUpAt, ...rest } = payload.patch;
        const hasPatch = Object.values(payload.patch).some((value) => value !== undefined);
        if (!hasPatch) throw new ApiError(422, "EMPTY_PATCH", "No lead fields were provided.");
        return Response.json(
          updateLead(user, id, {
            ...rest,
            ...(nextFollowUpAt !== undefined ? { nextFollowUpAt: nextFollowUpAt || null } : {}),
          }),
        );
      }
      case "ASSIGN":
        return Response.json(assignLead(user, id, payload.ownerId));
      case "STATUS":
        return Response.json(changeLeadStatus(user, id, payload.status, payload.note));
      case "FOLLOW_UP":
        return Response.json(
          addFollowUp(user, id, {
            channel: payload.channel,
            outcome: payload.outcome,
            notes: payload.notes,
            nextFollowUpAt: payload.nextFollowUpAt || null,
          }),
        );
      case "CONVERT":
        return Response.json(convertLead(user, id, payload));
    }
  } catch (error) {
    return errorResponse(error);
  }
}

export const runtime = "nodejs";
