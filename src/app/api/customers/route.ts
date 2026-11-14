import { assertPermission, errorResponse, requireSession } from "@/server/access";
import { getCustomersWorkspace } from "@/server/customers";

export async function GET(request: Request) {
  try {
    const user = await requireSession();
    assertPermission(user, "customers:view");
    const params = new URL(request.url).searchParams;
    const data = getCustomersWorkspace(user, {
      tab: params.get("tab") ?? undefined,
      q: params.get("q") ?? undefined,
      kyc: params.get("kyc") ?? undefined,
      branchId: params.get("branch") ?? undefined,
      employmentType: params.get("employment") ?? undefined,
    });
    return Response.json(data);
  } catch (error) {
    return errorResponse(error);
  }
}

export const runtime = "nodejs";
