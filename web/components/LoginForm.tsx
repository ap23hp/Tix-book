"use client"; // needs state (errors, loading) and an onSubmit handler

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormField } from "@/components/FormField";
import { postAuth, type FieldErrors } from "@/lib/auth-client";

export function LoginForm() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return; // ignore double clicks

    const form = new FormData(event.currentTarget);
    setPending(true);
    setMessage(null);
    setFieldErrors({});

    const result = await postAuth("login", {
      email: form.get("email"),
      password: form.get("password"),
    });

    if (!result.ok) {
      setMessage(result.message);
      setFieldErrors(result.fieldErrors);
      setPending(false);
      return;
    }

    // The cookie is set. Go home, then refresh so the header
    // (a Server Component) re-renders and shows "Hi, name".
    router.push("/");
    router.refresh();
  }

  return (
    <form
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
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        error={fieldErrors.email}
      />
      <FormField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={fieldErrors.password}
      />

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-accent px-7 py-3 font-semibold text-surface hover:bg-accent-hover disabled:opacity-60"
      >
        {pending ? "Logging in…" : "Log in"}
      </button>

      <p className="text-sm text-ink-soft">
        New here?{" "}
        <Link href="/signup" className="text-ink underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </form>
  );
}
