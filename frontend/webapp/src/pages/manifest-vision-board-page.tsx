import { IdeateCloudProvider } from "@/components/plan/ideate-cloud-provider";
import { IdeateVisionBoardClient } from "@/components/plan/ideate-vision-board-client";

export function ManifestVisionBoardPage() {
  return (
    <IdeateCloudProvider>
      <IdeateVisionBoardClient />
    </IdeateCloudProvider>
  );
}
