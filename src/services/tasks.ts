import { patchJson, postJson } from "@/lib/api";
import type { Task } from "@/lib/types";
import type { CreateTaskInput, UpdateTaskInput } from "@/server/tasks";

export type TaskMutationResult = { task: Task; message: string };

export const tasksService = {
  create(input: CreateTaskInput) {
    return postJson<TaskMutationResult>("/tasks", input);
  },
  update(taskId: string, input: UpdateTaskInput) {
    return patchJson<TaskMutationResult>(`/tasks/${taskId}`, input);
  },
};
