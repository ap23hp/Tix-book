import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { display, label } from "@/lib/ui";

export const metadata: Metadata = { title: "Your account | Tixbook" };

export default function AccountPage() {
  return (
    <div className="mx-auto w-full max-w-md px-6 py-12">
      <h1 className={`text-display-md text-ink ${display}`}>Your account</h1>
      {/* Reading the cookie must happen inside Suspense (Cache Components rule) */}
      <Suspense fallback={<p className="mt-6 text-ink-muted">Loading…</p>}>
        <AccountDetails />
      </Suspense>
    </div>
  );
}

async function AccountDetails() {
  const user = await getCurrentUser();

  // Not logged in → send to the login page. redirect() stops rendering here.
  if (!user) redirect("/login");

  return (
    <dl className="mt-6 flex flex-col gap-4">
      <div>
        <dt className={`text-ink-muted ${label}`}>Name</dt>
        <dd className="text-ink">{user.name}</dd>
      </div>
      <div>
        <dt className={`text-ink-muted ${label}`}>Email</dt>
        <dd className="text-ink">{user.email}</dd>
      </div>
      <div>
        <dt className={`text-ink-muted ${label}`}>Account type</dt>
        <dd className="text-ink">
          {user.role === "ORGANISER" ? "Organiser" : "Attendee"}
        </dd>
      </div>
    </dl>
  );
}
