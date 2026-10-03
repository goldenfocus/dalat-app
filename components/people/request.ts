/** Same-origin People mutations. Keep database details out of user-facing errors. */
export class PeopleRequestError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "PeopleRequestError";
  }
}

export async function requestPeople<T>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body: Record<string, unknown>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      throw new PeopleRequestError(
        typeof result?.code === "string" ? result.code : "request_failed",
      );
    }
    return result as T;
  } finally {
    clearTimeout(timeout);
  }
}
