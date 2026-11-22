import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";

// Server Component: reads the cookie, so it must sit inside <Suspense> (see layout.tsx)
export async function UserMenu() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <Link
        href="/login"
        className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-surface hover:bg-ink-soft"
      >
        Log in
      </Link>
    );
  }

  // On a phone the four items don't fit next to the logo: the header wraps
  // this menu onto its own row (layout.tsx), and the menu itself can wrap.
  // whitespace-nowrap keeps each item on one line ("My events", not "My / events").
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 whitespace-nowrap">
      {user.role === "ORGANISER" && (
        <Link
          href="/my-events"
          className="text-sm font-semibold text-ink hover:underline"
        >
          My events
        </Link>
      )}
      {user.role === "ORGANISER" && (
        <Link
          href="/events/new"
          className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-surface hover:bg-ink-soft"
        >
          Create event
        </Link>
      )}
      {/* A long name is cut short with "…" instead of pushing the menu wider */}
      <Link
        href="/account"
        className="max-w-48 truncate text-sm font-semibold text-ink hover:underline"
      >
        Hi, {user.name}
      </Link>
      <LogoutButton />
    </div>
  );
}
