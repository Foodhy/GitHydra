import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { AppChrome } from "../features/repos/AppChrome";
import { SettingsPage } from "../features/settings/SettingsPage";
import { WelcomePage } from "../features/welcome/WelcomePage";
import { WorkspacePage } from "../features/workspace/WorkspacePage";
import { applyAppearance, readAppearance } from "../lib/appearance";

const rootRoute = createRootRoute({
  component: () => (
    <div className="flex h-full flex-col">
      <AppChrome />
      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  ),
});

const welcomeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: WelcomePage,
});

const repoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/repo/$",
  component: WorkspacePage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  welcomeRoute,
  repoRoute,
  settingsRoute,
]);

export const router = createRouter({
  routeTree,
  history: createHashHistory(),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export function AppRouter() {
  useEffect(() => {
    readAppearance()
      .then((appearance) => {
        applyAppearance(appearance.style, appearance.accent);
      })
      .catch(() => {
        applyAppearance("hydra", "#3ee0b0");
      });
  }, []);

  return <RouterProvider router={router} />;
}
