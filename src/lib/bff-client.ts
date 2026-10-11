export class BffClientError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = "BffClientError";
  }
}

type ApiError = { error?: string; message?: string };

/** Cliente público del BFF. Las integraciones privadas nunca llegan al navegador. */
async function post<T>(endpoint: string, body: unknown): Promise<T> {
  try {
    const response = await fetch(new URL(endpoint, window.location.origin), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => null)) as (ApiError & T) | null;
    if (!response.ok) throw new BffClientError(response.status, payload?.message || payload?.error || `Error ${response.status}`);
    return payload as T;
  } catch (error) {
    if (error instanceof BffClientError) throw error;
    throw new BffClientError(0, "Error de conexión con el BFF");
  }
}

export const BffClient = { post };
