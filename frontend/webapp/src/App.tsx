import { Navigate, Route, Routes } from "react-router-dom";
import { AdminAiCostsPanel } from "./components/admin-ai-costs-panel";
import { AdminCompositionCoversPanel } from "./components/admin-composition-covers-panel";
import { AdminAnalyticsPanel } from "./components/admin-analytics-panel";
import { AdminReadPanel } from "./components/admin-blog-panel";
import { AdminGuidesPanel } from "./components/admin-guides-panel";
import { AdminDevUiPanel } from "./components/admin-dev-ui-panel";
import { AdminPrepromptsPanel } from "./components/admin-preprompts-panel";
import { AdminLibraryCategoriesPanel } from "./components/admin-library-categories-panel";
import { AdminProgramsPanel } from "./components/admin-programs-panel";
import { AdminScriptLabPanel } from "./components/admin-script-lab-panel";
import { AdminSoundsPanel } from "./components/admin-sounds-panel";
import { AdminStressTestPanel } from "./components/admin-stress-test-panel";
import { AdminVoicePanel } from "./components/admin-voice-panel";
import { AdminStylesPanel } from "./components/admin-styles-panel";
import { AdminVoiceFxPanel } from "./components/admin-voice-fx-panel";
import { MixerSoundsStudio } from "./components/mixer-sounds-studio";
import { AppShell } from "./shell/app-shell";
import { AdminLayout } from "./pages/admin-layout";
import { ChatPage } from "./pages/chat-page";
import { CreatePage } from "./pages/create-page";
import { FocusPage } from "./pages/focus-page";
import {
  HealHomePage,
  HealItemPage,
  HealLetterPage,
  HealRestedPage,
  HealSupportPage,
} from "./pages/heal-page";
import { HomePage } from "./pages/home-page";
import { JournalPage } from "./pages/journal-page";
import { LibraryPage } from "./pages/library-page";
import { ManifestGoalPage } from "./pages/manifest-goal-page";
import {
  ManifestHomePage,
  ManifestPosterPage,
  ManifestStoryPage,
} from "./pages/manifest-home-page";
import { ManifestInsightsPage } from "./pages/manifest-insights-page";
import { ManifestQuestionsPage } from "./pages/manifest-questions-page";
import { ManifestVisionBoardPage } from "./pages/manifest-vision-board-page";
import { ManifestWordsPage } from "./pages/manifest-words-page";
import { JournalOverviewPage } from "./pages/journal-overview-page";
import {
  JournalGuideArticlePage,
  JournalGuidesIndexPage,
  ManifestGuideArticlePage,
  ManifestGuidesIndexPage,
  MeditateGuideArticlePage,
  MeditateGuidesIndexPage,
} from "./pages/meditate-guides-page";
import { MeditateOverviewPage } from "./pages/meditate-overview-page";
import { SchedulePage } from "./pages/schedule-page";
import { SettingsPage } from "./pages/settings-page";
import { PricingPage } from "./pages/pricing-page";
import { PricingSuccessPage } from "./pages/pricing-success-page";
import { SoundsPage } from "./pages/sounds-page";
import { LoggedOutShell } from "./shell/logged-out-shell";
import { CognitoCallbackPage } from "./pages/cognito-callback-page";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="heal" element={<HealHomePage />} />
        <Route path="heal/rested" element={<HealRestedPage />} />
        <Route path="heal/support" element={<HealSupportPage />} />
        <Route path="heal/:itemId/letter" element={<HealLetterPage />} />
        <Route path="heal/:itemId/letter/:entryId" element={<HealLetterPage />} />
        <Route path="heal/:itemId" element={<HealItemPage />} />
        <Route path="focus" element={<FocusPage />} />
        <Route path="focus/my" element={<Navigate to="/focus" replace />} />
        <Route path="journal">
          <Route index element={<JournalOverviewPage />} />
          <Route path="guides" element={<JournalGuidesIndexPage />} />
          <Route path="guides/:slug" element={<JournalGuideArticlePage />} />
          <Route path="my/*" element={<JournalPage />} />
        </Route>
        <Route path="chat" element={<Navigate to="/chat/my" replace />} />
        <Route path="chat/my/*" element={<ChatPage />} />
        <Route path="manifest" element={<Navigate to="/manifest/my" replace />} />
        <Route path="manifest/my" element={<ManifestHomePage />} />
        <Route path="manifest/story" element={<ManifestStoryPage />} />
        <Route path="manifest/poster" element={<ManifestPosterPage />} />
        <Route path="manifest/guides" element={<ManifestGuidesIndexPage />} />
        <Route
          path="manifest/guides/:slug"
          element={<ManifestGuideArticlePage />}
        />
        <Route
          path="manifest/my/vision-board"
          element={<ManifestVisionBoardPage />}
        />
        <Route
          path="manifest/my/insights"
          element={<ManifestInsightsPage />}
        />
        <Route path="manifest/goal/:id" element={<ManifestGoalPage />} />
        <Route path="manifest/words" element={<ManifestWordsPage />} />
        <Route path="manifest/questions" element={<ManifestQuestionsPage />} />
        <Route path="meditate">
          <Route index element={<MeditateOverviewPage />} />
          <Route path="guides" element={<MeditateGuidesIndexPage />} />
          <Route path="guides/:slug" element={<MeditateGuideArticlePage />} />
          <Route path="create" element={<CreatePage />} />
          <Route path="create/*" element={<CreatePage />} />
          <Route
            path="library"
            element={<Navigate to="/meditate/library/creations" replace />}
          />
          <Route path="library/*" element={<LibraryPage />} />
          <Route path="sounds/*" element={<SoundsPage />} />
        </Route>
        <Route path="create" element={<Navigate to="/meditate/create" replace />} />
        <Route
          path="library"
          element={<Navigate to="/meditate/library/creations" replace />}
        />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="settings/:section" element={<SettingsPage />} />
        {/* Unknown settings subpaths → Account (avoid catch-all → home). */}
        <Route
          path="settings/*"
          element={<Navigate to="/settings/account" replace />}
        />
        <Route path="pricing" element={<PricingPage />} />
        <Route path="pricing/success" element={<PricingSuccessPage />} />
        <Route path="pro" element={<Navigate to="/pricing" replace />} />
        <Route path="schedule" element={<SchedulePage />} />
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="sounds" replace />} />
          <Route path="sounds" element={<AdminSoundsPanel />} />
          <Route
            path="sound-mixes"
            element={<MixerSoundsStudio variant="admin" />}
          />
          <Route path="voice" element={<AdminVoicePanel />} />
          <Route path="styles" element={<AdminStylesPanel />} />
          <Route path="fx" element={<AdminVoiceFxPanel />} />
          <Route path="programs" element={<AdminProgramsPanel />} />
          <Route path="blog" element={<AdminReadPanel />} />
          <Route path="read" element={<AdminReadPanel />} />
          <Route path="guides" element={<AdminGuidesPanel />} />
          <Route path="analytics" element={<AdminAnalyticsPanel />} />
          <Route path="ai-costs" element={<AdminAiCostsPanel />} />
          <Route path="script-lab" element={<AdminScriptLabPanel />} />
          <Route path="stress-test" element={<AdminStressTestPanel />} />
          <Route path="dev-ui" element={<AdminDevUiPanel />} />
          <Route path="preprompts" element={<AdminPrepromptsPanel />} />
          <Route
            path="category-images"
            element={<AdminLibraryCategoriesPanel />}
          />
          <Route
            path="composition-covers"
            element={<AdminCompositionCoversPanel />}
          />
        </Route>
      </Route>
      <Route path="login" element={<LoggedOutShell />} />
      <Route path="auth/cognito/callback" element={<CognitoCallbackPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
