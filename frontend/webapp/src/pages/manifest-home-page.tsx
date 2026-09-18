import { IdeateCloudProvider } from "@/components/plan/ideate-cloud-provider";
import { PlanHomeClient } from "@/components/plan/plan-home-client";

export function ManifestHomePage() {
  return (
    <IdeateCloudProvider>
      <PlanHomeClient />
    </IdeateCloudProvider>
  );
}
