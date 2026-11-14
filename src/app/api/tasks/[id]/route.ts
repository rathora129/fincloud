import { z } from "zod";
import { ApiError, assertPermission, errorResponse, requireSession } from "@/server/access";
import { updateTask } from "@/server/tasks";

const schema = z
  .object({
    status: z.enum(["OPEN", "IN_PROGRESS", "COMPLETED", "ESCALATED", "CANCELLED"]).optional(),
    assigneeId: z.string().trim().min(1).optional(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
    dueDate: z.string().trim().min(1).optional(),
  })
  .refine((value) => Boolean(value.status || value.assigneeId || value.priority || value.dueDate), {
    message: "Provide a status, assignee, priority or due date to update.",
  });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSession();
    assertPermission(user, "tasks:manage");
    const { id } = await params;

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(422, "VALIDATION", parsed.error.issues[0]?.message ?? "Check the submitted values.");
    }

    const task = updateTask(user, id, parsed.data);
    return Response.json({ task, message: `${task.ref} updated.` });
  } catch (error) {
    return errorResponse(error);
  }
}

export const runtime = "nodejs";
