"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    // Through the rewrite, so the browser sends our session cookie
    await fetch("/api/v1/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/");
    router.refresh(); // header re-renders with "Log in"
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="text-sm font-semibold text-ink-soft underline underline-offset-4 hover:text-ink disabled:opacity-60"
    >
      {pending ? "Logging out…" : "Log out"}
    </button>
  );
}
