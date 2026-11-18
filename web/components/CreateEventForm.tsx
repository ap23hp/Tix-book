"use client";

import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FormField } from "@/components/FormField";
import { Button } from "@/components/ui/Button";
import { postJson, type FieldErrors } from "@/lib/client-api";

const CATEGORIES = ["Comedy", "Music", "Business", "Workshops"];

const inputClass =
  "rounded-lg border border-line bg-surface px-4 py-3 text-ink aria-invalid:border-accent";

// "2026-12-05T19:30" (from <input type="datetime-local">) → ISO string in UTC.
// The browser reads the value in the organiser's own timezone.
function toIso(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string" || value === "") return undefined;
  return new Date(value).toISOString();
}

// Empty text boxes → undefined, so optional API fields are left out
function textOrUndefined(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function CreateEventForm() {
  const router = useRouter();
  const [format, setFormat] = useState<"IN_PERSON" | "ONLINE">("IN_PERSON");
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const shouldReset = useRef(false);

  // Unlike the login form, a half-written event is worth keeping if the
  // organiser navigates away. So only clear it after a successful create
  // (pattern from the Next.js "Preserving UI state" guide).
  useLayoutEffect(() => {
    const form = formRef.current;
    return () => {
      if (!shouldReset.current) return;
      shouldReset.current = false;
      form?.reset();
      setFormat("IN_PERSON");
      setMessage(null);
      setFieldErrors({});
      setPending(false);
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const form = new FormData(event.currentTarget);
    const isOnline = format === "ONLINE";

    // Price is typed in pounds; the API stores pence (whole numbers, no rounding errors)
    const priceText = form.get("price");
    const pricePence =
      typeof priceText === "string" && priceText !== ""
        ? Math.round(Number(priceText) * 100)
        : undefined;

    const seatsText = form.get("seatLimit");
    const seatLimit =
      typeof seatsText === "string" && seatsText !== ""
        ? Number(seatsText)
        : undefined;

    setPending(true);
    setMessage(null);
    setFieldErrors({});

    const result = await postJson<{ id: string }>("/api/v1/events", {
      title: form.get("title"),
      description: form.get("description"),
      category: form.get("category"),
      format,
      // Drafts can't be seen by anyone yet (no "My events" page until phase 3),
      // so every event is published straight away.
      status: "PUBLISHED",
      startsAt: toIso(form.get("startsAt")),
      endsAt: toIso(form.get("endsAt")),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      venueName: isOnline ? undefined : textOrUndefined(form.get("venueName")),
      venueAddress: isOnline
        ? undefined
        : textOrUndefined(form.get("venueAddress")),
      meetingLink: isOnline
        ? textOrUndefined(form.get("meetingLink"))
        : undefined,
      pricePence,
      seatLimit,
    });

    if (!result.ok) {
      setMessage(
        result.status === 400
          ? "Please fix the highlighted fields."
          : result.message,
      );
      setFieldErrors(result.fieldErrors);
      setPending(false);
      return;
    }

    shouldReset.current = true;
    router.push(`/events/${result.data.id}`);
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      noValidate
      className="mt-8 flex flex-col gap-5"
    >
      {message && (
        <p
          role="alert"
          className="rounded-lg bg-surface px-4 py-3 text-sm text-accent"
        >
          {message}
        </p>
      )}

      <FormField
        label="Title"
        name="title"
        required
        maxLength={120}
        error={fieldErrors.title}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-semibold text-ink">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={5}
          required
          aria-invalid={fieldErrors.description ? true : undefined}
          aria-describedby={
            fieldErrors.description ? "description-error" : undefined
          }
          className={inputClass}
        />
        {fieldErrors.description && (
          <p id="description-error" className="text-sm text-accent">
            {fieldErrors.description}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="category" className="text-sm font-semibold text-ink">
          Category
        </label>
        <select
          id="category"
          name="category"
          defaultValue={CATEGORIES[0]}
          className={inputClass}
        >
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold text-ink">Format</legend>
        <label className="flex items-center gap-2 text-ink-soft">
          <input
            type="radio"
            name="format"
            value="IN_PERSON"
            checked={format === "IN_PERSON"}
            onChange={() => setFormat("IN_PERSON")}
          />
          In person
        </label>
        <label className="flex items-center gap-2 text-ink-soft">
          <input
            type="radio"
            name="format"
            value="ONLINE"
            checked={format === "ONLINE"}
            onChange={() => setFormat("ONLINE")}
          />
          Online
        </label>
      </fieldset>

      {format === "IN_PERSON" ? (
        <>
          <FormField
            label="Venue name"
            name="venueName"
            required
            error={fieldErrors.venueName}
          />
          <FormField
            label="Venue address"
            name="venueAddress"
            required
            error={fieldErrors.venueAddress}
          />
        </>
      ) : (
        <FormField
          label="Meeting link"
          name="meetingLink"
          type="url"
          placeholder="https://"
          required
          error={fieldErrors.meetingLink}
        />
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Starts"
          name="startsAt"
          type="datetime-local"
          required
          error={fieldErrors.startsAt}
        />
        <FormField
          label="Ends"
          name="endsAt"
          type="datetime-local"
          required
          error={fieldErrors.endsAt}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Price (£, 0 for free)"
          name="price"
          type="number"
          min={0}
          step="0.01"
          required
          error={fieldErrors.pricePence}
        />
        <FormField
          label="Seats"
          name="seatLimit"
          type="number"
          min={1}
          max={10000}
          step={1}
          required
          error={fieldErrors.seatLimit}
        />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Creating event…" : "Create event"}
      </Button>
    </form>
  );
}
