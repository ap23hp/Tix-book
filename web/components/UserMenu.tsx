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

  return (
    <div className="flex items-center gap-4">
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
      <Link
        href="/account"
        className="text-sm font-semibold text-ink hover:underline"
      >
        Hi, {user.name}
      </Link>
      <LogoutButton />
    </div>
  );
}
