"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormField } from "@/components/FormField";
import { postAuth, type FieldErrors } from "@/lib/auth-client";

export function SignupForm() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const form = new FormData(event.currentTarget);
    const email = form.get("email");
    const password = form.get("password");

    setPending(true);
    setMessage(null);
    setFieldErrors({});

    const signup = await postAuth("signup", {
      name: form.get("name"),
      email,
      password,
      role: form.get("role"),
    });

    if (!signup.ok) {
      setMessage(signup.message);
      setFieldErrors(signup.fieldErrors);
      setPending(false);
      return;
    }

    // Sign-up doesn't start a session (the API keeps them separate),
    // so log in straight away with the same details.
    const login = await postAuth("login", { email, password });

    if (!login.ok) {
      // Account exists but auto-login failed: send them to log in by hand
      router.push("/login");
      return;
    }

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
        label="Name"
        name="name"
        autoComplete="name"
        required
        maxLength={100}
        error={fieldErrors.name}
      />
      <FormField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        error={fieldErrors.email}
      />
      <FormField
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

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-accent px-7 py-3 font-semibold text-surface hover:bg-accent-hover disabled:opacity-60"
      >
        {pending ? "Creating account…" : "Create account"}
      </button>

      <p className="text-sm text-ink-soft">
        Already have an account?{" "}
        <Link href="/login" className="text-ink underline underline-offset-4">
          Log in
        </Link>
      </p>
    </form>
  );
}
