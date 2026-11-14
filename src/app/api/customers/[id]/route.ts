import { assertPermission, errorResponse, requireSession } from "@/server/access";
import { getCustomerDetail } from "@/server/customers";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireSession();
    assertPermission(user, "customers:view");
    const { id } = await context.params;
    return Response.json(getCustomerDetail(user, id));
  } catch (error) {
    return errorResponse(error);
  }
}

export const runtime = "nodejs";
