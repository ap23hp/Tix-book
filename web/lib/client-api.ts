// Browser-side POST helper for our API.
// Relative URLs ("/api/...") go through the rewrite in next.config.ts,
// so the session cookie belongs to our own site (first-party) and is sent.

export type FieldErrors = Record<string, string>;

export type PostResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string; fieldErrors: FieldErrors };

type ErrorBody = {
  error?: string;
  details?: { field: string; message: string }[];
};

export async function postJson<T>(
  url: string,
  body: unknown,
): Promise<PostResult<T>> {
  let res: Response;

  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // Network down, or the request never reached the server
    return {
      ok: false,
      status: 0,
      message: "Couldn't reach the server. Try again.",
      fieldErrors: {},
    };
  }

  if (res.ok) {
    // 204 has no body, so don't fail if there's nothing to parse
    const data = (await res.json().catch(() => null)) as T;
    return { ok: true, data };
  }

  // The API sends { error, details? }. Be careful: a 502 from a proxy may not be JSON.
  const errorBody = (await res.json().catch(() => ({}))) as ErrorBody;

  const fieldErrors: FieldErrors = {};
  for (const issue of errorBody.details ?? []) {
    fieldErrors[issue.field] ??= issue.message;
  }

  return {
    ok: false,
    status: res.status,
    message: errorBody.error ?? "Something went wrong. Try again.",
    fieldErrors,
  };
}