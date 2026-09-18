import { Navigate, Route, Routes } from "react-router-dom";
import { AdminAnalyticsPanel } from "./components/admin-analytics-panel";
import { AdminReadPanel } from "./components/admin-blog-panel";
import { AdminDevUiPanel } from "./components/admin-dev-ui-panel";
import { AdminProgramsPanel } from "./components/admin-programs-panel";
import { AdminScriptLabPanel } from "./components/admin-script-lab-panel";
import { AdminSoundsPanel } from "./components/admin-sounds-panel";
import { AdminStressTestPanel } from "./components/admin-stress-test-panel";
import { AdminVoicePanel } from "./components/admin-voice-panel";
import { MixerSoundsStudio } from "./components/mixer-sounds-studio";
import { AppShell } from "./shell/app-shell";
import { AdminLayout } from "./pages/admin-layout";
import { ChatPage } from "./pages/chat-page";
import { CreatePage } from "./pages/create-page";
import { FocusPage } from "./pages/focus-page";
import { HomePage } from "./pages/home-page";
import { JournalPage } from "./pages/journal-page";
import { LibraryPage } from "./pages/library-page";
import { ManifestGoalPage } from "./pages/manifest-goal-page";
import { ManifestHomePage } from "./pages/manifest-home-page";
import { ManifestVisionBoardPage } from "./pages/manifest-vision-board-page";
import { SchedulePage } from "./pages/schedule-page";
import { SettingsPage } from "./pages/settings-page";
import { SoundsPage } from "./pages/sounds-page";
import { LoggedOutShell } from "./shell/logged-out-shell";
import { CognitoCallbackPage } from "./pages/cognito-callback-page";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="focus" element={<FocusPage />} />
        <Route path="focus/my" element={<Navigate to="/focus" replace />} />
        <Route path="journal" element={<Navigate to="/journal/my" replace />} />
        <Route path="journal/my/*" element={<JournalPage />} />
        <Route path="chat" element={<Navigate to="/chat/my" replace />} />
        <Route path="chat/my/*" element={<ChatPage />} />
        <Route path="manifest" element={<Navigate to="/manifest/my" replace />} />
        <Route path="manifest/my" element={<ManifestHomePage />} />
        <Route
          path="manifest/my/vision-board"
          element={<ManifestVisionBoardPage />}
        />
        <Route path="manifest/goal/:id" element={<ManifestGoalPage />} />
        <Route path="meditate/create" element={<CreatePage />} />
        <Route path="meditate/create/*" element={<CreatePage />} />
        <Route
          path="meditate/library"
          element={<Navigate to="/meditate/library/creations" replace />}
        />
        <Route path="meditate/library/*" element={<LibraryPage />} />
        <Route path="meditate/sounds/*" element={<SoundsPage />} />
        <Route path="create" element={<Navigate to="/meditate/create" replace />} />
        <Route
          path="library"
          element={<Navigate to="/meditate/library/creations" replace />}
        />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="schedule" element={<SchedulePage />} />
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="sounds" replace />} />
          <Route path="sounds" element={<AdminSoundsPanel />} />
          <Route
            path="sound-mixes"
            element={<MixerSoundsStudio variant="admin" />}
          />
          <Route path="voice" element={<AdminVoicePanel />} />
          <Route path="programs" element={<AdminProgramsPanel />} />
          <Route path="blog" element={<AdminReadPanel />} />
          <Route path="read" element={<AdminReadPanel />} />
          <Route path="analytics" element={<AdminAnalyticsPanel />} />
          <Route path="script-lab" element={<AdminScriptLabPanel />} />
          <Route path="stress-test" element={<AdminStressTestPanel />} />
          <Route path="dev-ui" element={<AdminDevUiPanel />} />
        </Route>
      </Route>
      <Route path="login" element={<LoggedOutShell />} />
      <Route path="auth/cognito/callback" element={<CognitoCallbackPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
