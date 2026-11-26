// Placeholders with the same box sizes as the real layout, so nothing jumps when data arrives.
const shimmer = "shimmer animate-shimmer motion-reduce:animate-none";

export function EventListSkeleton() {
  return (
    // Same shape as the real page (filters, then two rows of cards), so the
    // page doesn't grow when the list arrives. With only one short row, the
    // footer started on screen and jumped down when the events streamed in:
    // a layout shift (CLS 0.05 on desktop, decision 072).
    <div aria-busy="true">
      <p role="status" className="sr-only">
        Loading events…
      </p>
      <FiltersSkeleton />
      <div className="mt-10 flex items-end justify-between border-b-2 border-line pb-2">
        <div className={`h-7 w-48 rounded-sm ${shimmer}`} />
        <div className="h-3 w-16 rounded-sm bg-skeleton" />
      </div>
      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

// The search, category and format fields (EventFilters) take this space
function FiltersSkeleton() {
  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
      {["w-full", "w-full sm:w-40", "w-full sm:w-40"].map((width, i) => (
        <div key={i} className={`flex flex-col gap-1.5 ${width}`}>
          <div className="h-5 w-24 rounded-sm bg-skeleton" />
          <div className="h-12.5 rounded-lg bg-skeleton" />
        </div>
      ))}
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-ticket bg-surface shadow-ticket">
      <div className={`h-36 ${shimmer}`} />
      <div className="space-y-2 px-5 pb-3 pt-4">
        <div className={`h-6 w-3/4 rounded-sm ${shimmer}`} />
        <div className="h-3 w-1/3 rounded-sm bg-skeleton" />
        <div className="h-3 w-1/2 rounded-sm bg-skeleton" />
      </div>
      <div className="mx-5 mt-auto border-t-2 border-dashed border-perf" />
      <div className="flex h-20 items-center justify-between px-5">
        <div className="h-12 w-14 rounded-sm bg-skeleton" />
        <div className="h-6 w-12 rounded-sm bg-skeleton" />
      </div>
    </div>
  );
}

export function EventDetailSkeleton() {
  return (
    <div aria-busy="true" className="mt-6">
      {/* Visually hidden h1 so screen readers still get a page heading (design note) */}
      <h1 className="sr-only">Loading event…</h1>
      <div className={`h-44 rounded-ticket-lg sm:h-56 ${shimmer}`} />
      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_320px]">
        <div>
          <div className={`h-12 w-2/3 rounded-sm ${shimmer}`} />
          <div className="mt-6 grid border-t-2 border-line sm:grid-cols-2 sm:gap-x-6">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-2 border-b border-line py-4">
                <div className="h-3 w-12 rounded-sm bg-skeleton" />
                <div className="h-4 w-40 rounded-sm bg-skeleton" />
              </div>
            ))}
          </div>
        </div>
        <div className="h-72 rounded-ticket bg-surface shadow-ticket" />
      </div>
    </div>
  );
}
