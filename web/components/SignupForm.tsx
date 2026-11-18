"use client";

import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { postAuth, type FieldErrors } from "@/lib/auth-client";

export function SignupForm() {
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
    if (pending) return;

    const form = new FormData(event.currentTarget);
    setPending(true);
    setMessage(null);
    setFieldErrors({});

    const signup = await postAuth("signup", {
      name: form.get("name"),
      email: form.get("email"),
      password: form.get("password"),
      role: form.get("role"),
    });

    if (!signup.ok) {
      setMessage(signup.message);
      setFieldErrors(signup.fieldErrors);
      setPending(false);
      return;
    }

    // Sign-up also logs you in (the API sets the session cookie),
    // so go home and refresh the header
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

      <Input
        label="Name"
        name="name"
        autoComplete="name"
        required
        maxLength={100}
        error={fieldErrors.name}
      />
      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        error={fieldErrors.email}
      />
      <Input
        label="Password (at least 8 characters)"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        maxLength={128}
        error={fieldErrors.password}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold text-ink">I want to</legend>
        <label className="flex items-center gap-2 text-ink-soft">
          <input type="radio" name="role" value="ATTENDEE" defaultChecked />
          Book tickets
        </label>
        <label className="flex items-center gap-2 text-ink-soft">
          <input type="radio" name="role" value="ORGANISER" />
          Organise events
        </label>
      </fieldset>

      <Button type="submit" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>

      <p className="text-sm text-ink-soft">
        Already have an account?{" "}
        <Link href="/login" className="text-ink underline underline-offset-4">
          Log in
        </Link>
      </p>
    </form>
  );
}
