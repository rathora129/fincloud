import { z } from "zod";
import { ApiError, assertPermission, errorResponse, requireSession } from "@/server/access";
import { createTask } from "@/server/tasks";

const schema = z.object({
  title: z.string().trim().min(5, "Task title needs at least 5 characters.").max(140),
  category: z.enum(["CREDIT", "COLLECTION", "FIELD", "LEGAL", "AGENCY", "GRE", "OTHER"], {
    message: "Select a task category.",
  }),
  description: z.string().trim().min(10, "Add a short description (10+ characters).").max(2000),
  assigneeId: z.string().trim().min(1, "Select an assignee."),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"], { message: "Select a priority." }),
  dueDate: z.string().trim().min(1, "Pick a due date."),
});

export async function POST(request: Request) {
  try {
    const user = await requireSession();
    assertPermission(user, "tasks:manage");

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(422, "VALIDATION", parsed.error.issues[0]?.message ?? "Check the submitted values.");
    }

    const task = createTask(user, parsed.data);
    return Response.json({ task, message: `Task ${task.ref} created.` }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export const runtime = "nodejs";
