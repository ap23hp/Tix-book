import type { Metadata } from "next";
import { GoogleButton, OrDivider } from "@/components/GoogleButton";
import { SignupForm } from "@/components/SignupForm";
import { display } from "@/lib/ui";

export const metadata: Metadata = { title: "Sign up | Tixbook" };

export default function SignupPage() {
  return (
    <div className="mx-auto w-full max-w-md px-6 py-12">
      <h1 className={`text-display-md text-ink ${display}`}>
        Create an account
      </h1>
      <div className="mt-8">
        <GoogleButton />
        <p className="mt-2 text-center text-sm text-ink-muted">
          Google sign-up creates an attendee account. To organise events, use
          the form below.
        </p>
      </div>
      <OrDivider />
      <SignupForm />
    </div>
  );
}