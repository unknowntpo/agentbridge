export type AppRoute = "dashboard" | "design-system"

export function resolveRoute(pathname: string): AppRoute {
  return pathname === "/design-system" ? "design-system" : "dashboard"
}

