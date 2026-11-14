import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { WelcomePage } from "../features/welcome/WelcomePage";
import { WorkspacePage } from "../features/workspace/WorkspacePage";

const rootRoute = createRootRoute({
  component: () => (
    <div className="h-full">
      <Outlet />
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

const routeTree = rootRoute.addChildren([welcomeRoute, repoRoute]);

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
  return <RouterProvider router={router} />;
}
