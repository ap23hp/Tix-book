"use client";

import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { fieldClass, Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { sendJson, type FieldErrors } from "@/lib/client-api";
import { fromDateTimeLocal, toDateTimeLocal } from "@/lib/datetime";
import type { MyEvent } from "@/lib/types";

const CATEGORIES = ["Comedy", "Music", "Business", "Workshops"];

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft (only you can see it)" },
  { value: "PUBLISHED", label: "Published" },
];

function dateOrUndefined(value: FormDataEntryValue | null): string | undefined {
  return typeof value === "string" ? fromDateTimeLocal(value) : undefined;
}

// Empty text boxes → undefined, so optional API fields are left out
function textOrUndefined(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

type Props = {
  // Given → edit this event (PATCH). Not given → create a new one (POST).
  event?: MyEvent;
};

export function EventForm({ event }: Props) {
  const isEdit = event !== undefined;
  const router = useRouter();
  const toast = useToast();
  const descriptionId = useId();
  const [format, setFormat] = useState(event?.format ?? "IN_PERSON");
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);
  // Has the organiser changed anything since the form opened?
  const [dirty, setDirty] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const shouldReset = useRef(false);

  // Unlike the login form, a half-written event is worth keeping if the
  // organiser navigates away. So only clear it after it's saved or discarded
  // (pattern from the Next.js "Preserving UI state" guide).
  // form.reset() goes back to the defaultValues, i.e. the saved event.
  useLayoutEffect(() => {
    const form = formRef.current;
    const initialFormat = event?.format ?? "IN_PERSON";
    return () => {
      if (!shouldReset.current) return;
      shouldReset.current = false;
      form?.reset();
      setFormat(initialFormat);
      setMessage(null);
      setFieldErrors({});
      setPending(false);
      setDirty(false);
      setConfirmingDiscard(false);
    };
  }, [event?.format]);

  async function handleSubmit(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    if (pending) return;

    const form = new FormData(submitEvent.currentTarget);
    const isOnline = format === "ONLINE";

    // When editing, fields hidden by the format are sent as null, which tells
    // the API to clear them (an online event shouldn't keep its old venue).
    // When creating, they're just left out.
    const cleared = isEdit ? null : undefined;

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

    const body = {
      title: form.get("title"),
      description: form.get("description"),
      category: form.get("category"),
      format,
      // New events are published straight away (as before). When editing,
      // the organiser chooses: Draft hides it from everyone else.
      status: isEdit ? form.get("status") : "PUBLISHED",
      startsAt: dateOrUndefined(form.get("startsAt")),
      endsAt: dateOrUndefined(form.get("endsAt")),
      // The time zone is set once, when the event is created
      timezone: isEdit
        ? undefined
        : Intl.DateTimeFormat().resolvedOptions().timeZone,
      venueName: isOnline
        ? cleared
        : (textOrUndefined(form.get("venueName")) ?? cleared),
      venueAddress: isOnline
        ? cleared
        : (textOrUndefined(form.get("venueAddress")) ?? cleared),
      meetingLink: isOnline
        ? (textOrUndefined(form.get("meetingLink")) ?? cleared)
        : cleared,
      pricePence,
      seatLimit,
    };

    const result = isEdit
      ? await sendJson<MyEvent>("PATCH", `/api/v1/events/${event.id}`, body)
      : await sendJson<{ id: string }>("POST", "/api/v1/events", body);

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
    if (isEdit) {
      // The toast lives in the root layout, so it's still showing on the next page
      toast({ message: "Event updated" });
      router.push("/my-events");
      router.refresh(); // show the new values, not a cached copy of the list
    } else {
      router.push(`/events/${result.data.id}`);
    }
  }

  // Cancel: leave straight away if nothing changed, otherwise ask first
  function handleCancel() {
    if (dirty) {
      setConfirmingDiscard(true);
    } else {
      router.push("/my-events");
    }
  }

  function discardChanges() {
    shouldReset.current = true; // clear the edits when this page is hidden
    setConfirmingDiscard(false);
    router.push("/my-events");
  }

  // The event's own category may not be one of the four (e.g. from the seed)
  const categories =
    event && !CATEGORIES.includes(event.category)
      ? [...CATEGORIES, event.category]
      : CATEGORIES;

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      // Any typing or choosing bubbles up to here
      onChange={() => setDirty(true)}
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

      <Input
        label="Title"
        name="title"
        required
        maxLength={120}
        defaultValue={event?.title}
        error={fieldErrors.title}
      />

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={descriptionId}
          className="text-sm font-semibold text-ink"
        >
          Description
        </label>
        <textarea
          id={descriptionId}
          name="description"
          rows={5}
          required
          defaultValue={event?.description}
          aria-invalid={fieldErrors.description ? true : undefined}
          aria-describedby={
            fieldErrors.description ? `${descriptionId}-error` : undefined
          }
          className={fieldClass}
        />
        {fieldErrors.description && (
          <p id={`${descriptionId}-error`} className="text-sm text-accent">
            {fieldErrors.description}
          </p>
        )}
      </div>

      <Select
        label="Category"
        name="category"
        defaultValue={event?.category ?? CATEGORIES[0]}
        options={categories.map((category) => ({
          value: category,
          label: category,
        }))}
      />

      {isEdit && (
        <Select
          label="Status"
          name="status"
          defaultValue={event.status === "DRAFT" ? "DRAFT" : "PUBLISHED"}
          options={STATUS_OPTIONS}
          error={fieldErrors.status}
        />
      )}

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
          <Input
            label="Venue name"
            name="venueName"
            required
            defaultValue={event?.venueName ?? undefined}
            error={fieldErrors.venueName}
          />
          <Input
            label="Venue address"
            name="venueAddress"
            required
            defaultValue={event?.venueAddress ?? undefined}
            error={fieldErrors.venueAddress}
          />
        </>
      ) : (
        <Input
          label="Meeting link"
          name="meetingLink"
          type="url"
          placeholder="https://"
          required
          defaultValue={event?.meetingLink ?? undefined}
          error={fieldErrors.meetingLink}
        />
      )}

      {/* Times are shown and read in the browser's time zone (lib/datetime.ts) */}
      <div className="grid gap-5 sm:grid-cols-2">
        <Input
          label="Starts"
          name="startsAt"
          type="datetime-local"
          required
          defaultValue={event && toDateTimeLocal(event.startsAt)}
          error={fieldErrors.startsAt}
        />
        <Input
          label="Ends"
          name="endsAt"
          type="datetime-local"
          required
          defaultValue={event && toDateTimeLocal(event.endsAt)}
          error={fieldErrors.endsAt}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Input
          label="Price (£, 0 for free)"
          name="price"
          type="number"
          min={0}
          step="0.01"
          required
          defaultValue={event && event.pricePence / 100}
          error={fieldErrors.pricePence}
        />
        <Input
          label="Seats"
          name="seatLimit"
          type="number"
          min={1}
          max={10000}
          step={1}
          required
          defaultValue={event?.seatLimit}
          error={fieldErrors.seatLimit}
        />
      </div>

      {isEdit ? (
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={handleCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      ) : (
        <Button type="submit" disabled={pending}>
          {pending ? "Creating event…" : "Create event"}
        </Button>
      )}

      {isEdit && (
        <Modal
          open={confirmingDiscard}
          onClose={() => setConfirmingDiscard(false)}
          title="Discard changes?"
        >
          <p className="text-ink-soft">
            Your changes to this event haven&apos;t been saved.
          </p>
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              variant="secondary"
              onClick={() => setConfirmingDiscard(false)}
            >
              Keep editing
            </Button>
            <Button onClick={discardChanges}>Discard changes</Button>
          </div>
        </Modal>
      )}
    </form>
  );
}
