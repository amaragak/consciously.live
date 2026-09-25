"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";
import { usePathname } from "@/lib/spa-nav";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTopBar } from "@/components/app-top-bar";
import { AppPrimaryTabsProvider } from "@/components/app-primary-tabs";
// FAB chat temporarily disabled
// import { AssistantChatFab } from "@/components/assistant-chat-fab";
import { MainShell } from "@/components/main-shell";
import {
  appSidebarWidthPx,
  loadAppSidebarCollapsed,
  saveAppSidebarCollapsed,
} from "@/lib/app-nav";
import {
  getMedimadeSessionDisplayName,
  getMedimadeSessionEmail,
} from "@/lib/auth-session";

type Props = {
  children: ReactNode;
};

/**
 * Logged-in SPA chrome: top bar, sidebar, main shell, assistant FAB.
 * Auth gating lives in AppShell — this always renders the app frame.
 */
export function AppChrome({ children }: Props) {
  const pathname = usePathname() || "/";
  const [accountLabel, setAccountLabel] = useState("Guest");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    loadAppSidebarCollapsed(),
  );

  useEffect(() => {
    const sync = () => {
      setAccountLabel(
        getMedimadeSessionDisplayName()?.trim() ||
          getMedimadeSessionEmail()?.trim() ||
          "Guest",
      );
      setSidebarCollapsed(loadAppSidebarCollapsed());
    };
    sync();
    window.addEventListener("medimade-session-changed", sync);
    return () => window.removeEventListener("medimade-session-changed", sync);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--app-sidebar-w",
      `${appSidebarWidthPx(sidebarCollapsed)}px`,
    );
    return () => {
      document.documentElement.style.removeProperty("--app-sidebar-w");
    };
  }, [sidebarCollapsed]);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((c) => {
      const next = !c;
      saveAppSidebarCollapsed(next);
      return next;
    });
  }, []);

  return (
    <AppPrimaryTabsProvider>
      <div className="flex h-dvh min-h-0 flex-1 flex-col overflow-hidden">
        <AppTopBar
          mobileSidebarOpen={mobileOpen}
          onToggleSidebar={() => setMobileOpen((v) => !v)}
          sidebarCollapsed={sidebarCollapsed}
        />
        <div className="flex min-h-0 flex-1">
          <div
            className="hidden shrink-0 md:block"
            style={{ width: "var(--app-sidebar-w, 200px)" }}
            aria-hidden
          />
          <AppSidebar
            accountLabel={accountLabel}
            mobileOpen={mobileOpen}
            onCloseMobile={() => setMobileOpen(false)}
            onNavigate={() => setMobileOpen(false)}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={toggleSidebarCollapsed}
          />
          <MainShell layout="app">{children}</MainShell>
        </div>
        {/* FAB chat temporarily disabled
        <AssistantChatFab />
        */}
      </div>
    </AppPrimaryTabsProvider>
  );
}
