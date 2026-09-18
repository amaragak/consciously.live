/**
 * SPA never mounts the marketing site footer — only marketing Next does.
 */
export function shouldShowAppFooter(
  _pathname: string,
  _layout: "default" | "app" = "default",
): boolean {
  return false;
}

/**
 * Document-scroll pages grow with content (MainShell scrolls).
 * Immersive workspaces fill the viewport and manage their own overflow.
 */
export function shouldUseDocumentScroll(
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
  if (path === "/focus" || path.startsWith("/focus/")) return false;
  if (path.startsWith("/admin")) return false;

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
