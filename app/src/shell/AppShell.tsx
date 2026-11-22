import { NavLink, Outlet } from "react-router";
import { logout, useAuth } from "wasp/client/auth";
import "./app.css";
import { NAV_ITEMS } from "./navigation";

// Root component (main.wasp.ts `client.rootComponent`): header, navigation and the routed page.
export function AppShell() {
  const { data: user } = useAuth();

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3">
          <span className="text-lg font-semibold">Atlas</span>
          {user ? (
            <button className="text-sm text-neutral-600 hover:text-neutral-900" onClick={logout}>
              Log out
            </button>
          ) : (
            <nav className="flex gap-4 text-sm">
              <NavLink to="/login">Log in</NavLink>
              <NavLink to="/signup">Sign up</NavLink>
            </nav>
          )}
        </div>
        {user && (
          <nav className="mx-auto flex max-w-6xl flex-wrap gap-x-4 gap-y-1 px-6 pb-3 text-sm">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end
                className={({ isActive }) =>
                  isActive ? "font-semibold text-neutral-900" : "text-neutral-600 hover:text-neutral-900"
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
