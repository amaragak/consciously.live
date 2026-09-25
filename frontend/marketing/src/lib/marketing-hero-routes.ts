/** Marketing routes that use a hero / field treatment — page pattern gutter is off. */
const MARKETING_HERO_ROUTES = new Set([
  "/",
  "/meditate",
  "/journal",
  "/manifest",
  "/ideate",
  "/dream",
  "/plan",
  "/focus",
  "/chat",
  "/connect",
  "/pricing",
  "/login",
  "/read",
]);

export function isMarketingHeroRoute(pathname: string): boolean {
  if (MARKETING_HERO_ROUTES.has(pathname)) return true;
  /* Read posts share the v2 paisley field with the index. */
  if (pathname.startsWith("/read/")) return true;
  return false;
}
