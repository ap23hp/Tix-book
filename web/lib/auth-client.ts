// Browser-side calls to the auth API.
// Relative URLs ("/api/...") go through the rewrite in next.config.ts,
// so the session cookie belongs to our own site (first-party).

export type FieldErrors = Record<string, string>;

export type AuthResult =
  { ok: true } | { ok: false; message: string; fieldErrors: FieldErrors };

type ErrorBody = {
  error?: string;
  details?: { field: string; message: string }[];
};

export async function postAuth(
  path: string,
  body: unknown,
): Promise<AuthResult> {
  let res: Response;

  try {
    res = await fetch(`/api/v1/auth/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // Network down, or the request never reached the server
    return {
      ok: false,
      message: "Couldn't reach the server. Try again.",
      fieldErrors: {},
    };
  }

  if (res.ok) return { ok: true };

  // The API sends { error, details? }. Be careful: a 502 from a proxy may not be JSON.
  const data = (await res.json().catch(() => ({}))) as ErrorBody;

  const fieldErrors: FieldErrors = {};
  for (const issue of data.details ?? []) {
    fieldErrors[issue.field] ??= issue.message;
  }

  return {
    ok: false,
    message: data.error ?? "Something went wrong. Try again.",
    fieldErrors,
  };
}
