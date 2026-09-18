import { EnhancedHomePage } from "@/components/enhanced-home-page";

/**
 * Public marketing home — always the suite landing.
 * Signed-in users stay here; enter the SPA via SiteHeader “Go to dashboard”.
 */
export default function HomePage() {
  return <EnhancedHomePage />;
}
