import type { Metadata } from "next";
import { SignupForm } from "@/components/SignupForm";
import { display } from "@/lib/ui";

export const metadata: Metadata = { title: "Sign up | Tixbook" };

export default function SignupPage() {
  return (
    <div className="mx-auto w-full max-w-md px-6 py-12">
      <h1 className={`text-display-md text-ink ${display}`}>
        Create an account
      </h1>
      <SignupForm />
    </div>
  );
}
