/**
 * Client helper: toggle a task's completed flag via the server route so
 * `task.completed` fires and the contact activity is logged. Throws on a
 * non-2xx response so callers' existing try/catch + toast flows work.
 */
export async function markTaskComplete(
  taskId: string,
  completed: boolean,
): Promise<void> {
  const res = await fetch(`/api/tasks/${taskId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completed }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Couldn't update task.");
  }
}
