"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CATEGORIES,
  FORMATS,
  toQueryString,
  type EventFilters as Filters,
} from "@/lib/events";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

// "All" (empty value) = no filter
const ALL = { value: "", label: "All" };
const CATEGORY_OPTIONS = [
  ALL,
  ...CATEGORIES.map((name) => ({ value: name, label: name })),
];
const FORMAT_OPTIONS = [ALL, ...FORMATS];

// Search box + filters. They don't fetch anything themselves: they put the
// choices in the URL (/?q=jazz&format=ONLINE) and the server page re-renders.
// So results can be shared, bookmarked, and survive a refresh.
export function EventFilters({ initial }: { initial: Filters }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [q, setQ] = useState(initial.q ?? "");
  const [category, setCategory] = useState(initial.category ?? "");
  const [format, setFormat] = useState(initial.format ?? "");

  // What the URL says right now
  const currentQuery = toQueryString(initial);

  // The URL can also change from outside: "Show all events" link, back button.
  // Then copy the URL's values into the boxes. But not when the change is the
  // one we just made, or we'd overwrite what the user is still typing.
  const [seenQuery, setSeenQuery] = useState(currentQuery);
  const [lastPushed, setLastPushed] = useState(currentQuery);
  if (currentQuery !== seenQuery) {
    setSeenQuery(currentQuery);
    if (currentQuery !== lastPushed) {
      setQ(initial.q ?? "");
      setCategory(initial.category ?? "");
      setFormat(initial.format ?? "");
    }
  }

  useEffect(() => {
    const query = toQueryString({ q: q.trim(), category, format });
    if (query === currentQuery) return; // nothing changed

    // Debounce: wait until typing pauses for 300 ms before updating the URL.
    // Each new keystroke runs the cleanup below, which cancels the old timer,
    // so "j", "ja", "jaz" never become requests; only "jazz" does.
    const timer = setTimeout(() => {
      setLastPushed(query);
      startTransition(() => {
        router.replace(query ? `/?${query}` : "/", { scroll: false });
      });
    }, 300);

    return () => clearTimeout(timer); // effect cleanup
  }, [q, category, format, currentQuery, router]);

  const hasFilters = Boolean(q || category || format);

  return (
    <form
      role="search"
      onSubmit={(event) => event.preventDefault()}
      className="mt-8 grid gap-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
    >
      <Input
        label="Search events"
        type="search"
        value={q}
        onChange={(event) => setQ(event.target.value)}
        placeholder="Comedy, jazz, workshop…"
        maxLength={100}
      />

      <Select
        label="Category"
        value={category}
        onChange={(event) => setCategory(event.target.value)}
        options={CATEGORY_OPTIONS}
      />

      <Select
        label="Format"
        value={format}
        onChange={(event) => setFormat(event.target.value)}
        options={FORMAT_OPTIONS}
      />

      {/* With no filters, Clear is hidden. From sm up it stays "invisible"
          (keeps its space), so the row doesn't jump when it appears. On a
          phone the fields are stacked and an invisible button would leave an
          empty gap, so there it's removed from the layout instead. */}
      <button
        type="button"
        onClick={() => {
          setQ("");
          setCategory("");
          setFormat("");
        }}
        disabled={!hasFilters}
        className="rounded-full px-5 py-3 text-sm font-semibold text-ink-soft underline underline-offset-4 hover:text-ink disabled:invisible max-sm:disabled:hidden"
      >
        Clear
      </button>

      {/* Screen readers hear when new results are on the way */}
      <p aria-live="polite" className="sr-only">
        {isPending ? "Updating results…" : ""}
      </p>
    </form>
  );
}
