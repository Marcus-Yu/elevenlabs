import type { ReactNode } from "react";
import { Link } from "react-router";
import { LoginForm, SignupForm } from "wasp/client/auth";

// Wasp's built-in username-and-password forms, branded like the Atlas overlay
// (tokens in src/shell/app.css). Only the look changes; fields and labels are Wasp's.

const appearance = {
  colors: {
    brand: "#1F5EF0", // overlay --accent
    brandAccent: "#2B57B8",
    submitButtonText: "#FFFFFF",
  },
};

function AuthCard({ children, footer }: { children: ReactNode; footer: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 pt-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="atlas-orb atlas-orb-lg" aria-hidden="true" />
        <span className="atlas-label">Atlas</span>
      </div>
      <div className="atlas-card atlas-auth w-full px-8 py-7">
        {children}
        <p className="mt-5 border-t border-neutral-200 pt-4 text-sm text-neutral-500">{footer}</p>
      </div>
    </div>
  );
}

export function LoginPage() {
  return (
    <AuthCard
      footer={
        <>
          No account yet?{" "}
          <Link to="/signup" className="atlas-link">
            Sign up
          </Link>
        </>
      }
    >
      <LoginForm appearance={appearance} />
    </AuthCard>
  );
}

export function SignupPage() {
  return (
    <AuthCard
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="atlas-link">
            Log in
          </Link>
        </>
      }
    >
      <SignupForm appearance={appearance} />
    </AuthCard>
  );
}
