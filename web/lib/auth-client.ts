// Browser-side calls to the auth API (login, sign-up).
import { postJson, type FieldErrors } from "@/lib/client-api";

export type { FieldErrors };

export type AuthResult =
  | { ok: true }
  | { ok: false; message: string; fieldErrors: FieldErrors };

export async function postAuth(
  path: string,
  body: unknown,
): Promise<AuthResult> {
  const result = await postJson(`/api/v1/auth/${path}`, body);

  if (result.ok) return { ok: true };
  return {
    ok: false,
    message: result.message,
    fieldErrors: result.fieldErrors,
  };
}