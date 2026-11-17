import { Suspense } from "react";
import type { Metadata } from "next";
import { GoogleButton, OrDivider } from "@/components/GoogleButton";
import { LoginForm } from "@/components/LoginForm";
import { display } from "@/lib/ui";

export const metadata: Metadata = { title: "Log in | Tixbook" };

// Messages for /login?error=... (set by the API's Google callback)
const GOOGLE_ERRORS: Record<string, string> = {
  google: "Google sign-in didn't work. Please try again.",
  "account-exists":
    "An account with this email already exists. Log in with your email and password.",
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <div className="mx-auto w-full max-w-md px-6 py-12">
      <h1 className={`text-display-md text-ink ${display}`}>Log in</h1>
      {/* Reading the URL's ?error= is request data, so it needs Suspense */}
      <Suspense fallback={null}>
        <GoogleError searchParams={searchParams} />
      </Suspense>
      <div className="mt-8">
        <GoogleButton />
      </div>
      <OrDivider />
      <LoginForm />
    </div>
  );
}

async function GoogleError({
  searchParams,
}: {
  searchParams: PageProps<"/login">["searchParams"];
}) {
  const { error } = await searchParams;
  const message = typeof error === "string" ? GOOGLE_ERRORS[error] : undefined;
  if (!message) return null;

  return (
    <p
      role="alert"
      className="mt-6 rounded-lg bg-surface px-4 py-3 text-sm text-accent"
    >
      {message}
    </p>
  );
}