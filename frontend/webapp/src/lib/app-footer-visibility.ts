/**
 * Whether the shared AppFooter should render for this route + chrome layout.
 * Hidden on auth and immersive full-height workspaces so they keep their own
 * bottom chrome (create bar, timer, editors).
 */
export function shouldShowAppFooter(
  pathname: string,
  layout: "default" | "app" = "default",
): boolean {
  const path = pathname || "/";

  if (path === "/login" || path.startsWith("/login/")) return false;
  if (path === "/auth" || path.startsWith("/auth/")) return false;

  if (path.startsWith("/meditate/create") || path.startsWith("/create")) {
    return false;
  }
  if (path === "/focus/my" || path.startsWith("/focus/my/")) return false;
  if (path.startsWith("/admin")) return false;

  // Immersive in-app workspaces — footer would fight flex fill / overflow shells.
  if (layout === "app") {
    if (path.startsWith("/chat/my")) return false;
    if (path.startsWith("/journal/my")) return false;
    if (path.startsWith("/meditate/sounds")) return false;
    if (path.startsWith("/manifest/my") || path.startsWith("/manifest/goal")) {
      return false;
    }
    if (
      path.startsWith("/ideate/my") ||
      path.startsWith("/ideate/goal") ||
      path.startsWith("/dream/my") ||
      path.startsWith("/dream/goal") ||
      path.startsWith("/plan/my") ||
      path.startsWith("/plan/goal")
    ) {
      return false;
    }
  }

  return true;
}
