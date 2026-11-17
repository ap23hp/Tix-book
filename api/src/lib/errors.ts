import type { z } from "zod";

// Every error the API sends has this shape:
//   { "error": "Human-readable message", "details"?: [{ field, message }] }
// "details" only appears for validation errors (400).

export type ErrorDetail = { field: string; message: string };

// Throw this from any route or middleware; the error handler in app.ts
// turns it into the JSON shape above with the right status code.
export class HttpError extends Error {
  readonly status: number;
  readonly details?: ErrorDetail[];

  constructor(status: number, message: string, details?: ErrorDetail[]) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.details = details;
  }
}

// Zod issues → [{ field: "endsAt", message: "..." }]
export function zodDetails(error: z.ZodError): ErrorDetail[] {
  return error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));
}

// Check data against a Zod schema. Valid → the parsed data.
// Invalid → throws a 400 HttpError with the field details.
export function parseOrThrow<S extends z.ZodType>(
  schema: S,
  data: unknown,
  message: string,
): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(400, message, zodDetails(result.error));
  }
  return result.data;
}