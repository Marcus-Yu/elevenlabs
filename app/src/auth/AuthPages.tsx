import type { ReactNode } from "react";
import { Link } from "react-router";
import { LoginForm, SignupForm } from "wasp/client/auth";

// Wasp's built-in username-and-password forms inside the app shell.

function AuthCard({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-md rounded-lg border border-neutral-200 bg-white p-8">{children}</div>;
}

export function LoginPage() {
  return (
    <AuthCard>
      <LoginForm />
      <p className="mt-4 text-sm">
        No account yet?{" "}
        <Link to="/signup" className="underline">
          Sign up
        </Link>
      </p>
    </AuthCard>
  );
}

export function SignupPage() {
  return (
    <AuthCard>
      <SignupForm />
      <p className="mt-4 text-sm">
        Already have an account?{" "}
        <Link to="/login" className="underline">
          Log in
        </Link>
      </p>
    </AuthCard>
  );
}
