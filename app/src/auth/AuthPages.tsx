import { Link } from "react-router";
import { LoginForm, SignupForm } from "wasp/client/auth";

// Wasp's built-in username-and-password forms. Styling and the app shell come in WP0 part 2.

export function LoginPage() {
  return (
    <main>
      <LoginForm />
      <p>
        No account yet? <Link to="/signup">Sign up</Link>
      </p>
    </main>
  );
}

export function SignupPage() {
  return (
    <main>
      <SignupForm />
      <p>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </main>
  );
}
