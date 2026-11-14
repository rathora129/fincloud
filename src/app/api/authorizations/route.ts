import { z } from "zod";
import { ApiError, assertPermission, errorResponse, requireSession } from "@/server/access";
import { createAuthorization } from "@/server/authorizations";

const schema = z
  .object({
    type: z.enum(["PAYMENT", "LMS_ACCOUNT", "AGENCY"], { message: "Select an authorization type." }),
    title: z.string().trim().min(5, "Request title needs at least 5 characters.").max(160),
    entityName: z.string().trim().min(3, "Add the entity this request applies to.").max(160),
    amount: z.coerce.number().optional().nullable(),
    remarks: z.string().trim().max(500).optional(),
  })
  .refine((value) => value.type !== "PAYMENT" || (typeof value.amount === "number" && value.amount > 0), {
    message: "Payment requests need an amount greater than zero.",
    path: ["amount"],
  });

export async function POST(request: Request) {
  try {
    const user = await requireSession();
    assertPermission(user, "authorizations:view");

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(422, "VALIDATION", parsed.error.issues[0]?.message ?? "Check the submitted values.");
    }

    const authorization = createAuthorization(user, parsed.data);
    return Response.json(
      { authorization, message: `${authorization.ref} raised for authorization.` },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export const runtime = "nodejs";
