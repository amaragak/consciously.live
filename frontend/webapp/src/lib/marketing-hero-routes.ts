/** Marketing routes that use the existing `.home-hero` treatment — page pattern is off. */
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
]);

export function isMarketingHeroRoute(pathname: string): boolean {
  return MARKETING_HERO_ROUTES.has(pathname);
}
