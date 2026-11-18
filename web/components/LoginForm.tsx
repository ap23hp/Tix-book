"use client"; // needs state (errors, loading) and an onSubmit handler

import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormField } from "@/components/FormField";
import { Button } from "@/components/ui/Button";
import { postAuth, type FieldErrors } from "@/lib/auth-client";

export function LoginForm() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // With Cache Components, Next.js hides pages (React <Activity>) instead of
  // removing them, so typed values and old errors would still be there when
  // the user comes back. For a login form that's wrong (and a password should
  // never sit in the page), so clear everything when this page is hidden.
  useLayoutEffect(() => {
    const form = formRef.current;
    return () => {
      form?.reset();
      setMessage(null);
      setFieldErrors({});
      setPending(false);
    };
  }, []);

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

      <Button type="submit" disabled={pending}>
        {pending ? "Logging in…" : "Log in"}
      </Button>

      <p className="text-sm text-ink-soft">
        New here?{" "}
        <Link href="/signup" className="text-ink underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </form>
  );
}
