import type { Metadata } from "next";
import { LoginForm } from "@/components/LoginForm";
import { display } from "@/lib/ui";

export const metadata: Metadata = { title: "Log in | Tixbook" };

export default function LoginPage() {
  return (
    <div className="mx-auto w-full max-w-md px-6 py-12">
      <h1 className={`text-display-md text-ink ${display}`}>Log in</h1>
      <LoginForm />
    </div>
  );
}
