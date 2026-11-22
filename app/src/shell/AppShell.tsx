import { NavLink, Outlet } from "react-router";
import { logout, useAuth } from "wasp/client/auth";
import "./app.css";
import { NAV_ITEMS } from "./navigation";

// Root component (main.wasp.ts `client.rootComponent`): header, navigation and the routed page.
export function AppShell() {
  const { data: user } = useAuth();

  return (
    <div className="min-h-screen text-neutral-900">
      <header className="atlas-header">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3">
          <span className="flex items-center gap-2.5">
            <span className="atlas-orb" aria-hidden="true" />
            <span className="atlas-wordmark">Atlas</span>
          </span>
          {user ? (
            <button className="atlas-nav-link" onClick={logout}>
              Log out
            </button>
          ) : (
            <nav className="flex gap-1">
              <NavLink to="/login" className="atlas-nav-link">
                Log in
              </NavLink>
              <NavLink to="/signup" className="atlas-nav-link">
                Sign up
              </NavLink>
            </nav>
          )}
        </div>
        {user && (
          <nav className="mx-auto flex max-w-6xl flex-wrap gap-0.5 px-4 pb-2.5">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.path} to={item.path} end className="atlas-nav-link">
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>
      <main className="atlas-main mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
