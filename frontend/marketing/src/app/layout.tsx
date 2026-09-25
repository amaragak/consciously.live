import type { Metadata } from "next";
import { Caveat, DM_Sans, Fraunces, Instrument_Sans } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import {
  HOME_HERO_PATTERN_DARK,
  HOME_HERO_PATTERN_LIGHT,
} from "@/lib/color-scheme";
import { homeHeroPatternCriticalCss, themeRootCss } from "@/lib/theme-colors";
import { ColorSchemeBoot } from "@/components/color-scheme-boot";
import { LibraryPlayerProvider } from "@/components/library-player-provider";
import { ProfileNameGate } from "@/components/profile-name-gate";
import { AppChromeHost } from "@/components/app-chrome-host";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const caveat = Caveat({
  subsets: ["latin"],
  variable: "--font-hand",
  weight: ["500"],
});

export const metadata: Metadata = {
  title: {
    default: "Consciously — live consciously with meditation & journal",
    template: "%s · Consciously",
  },
  description:
    "Consciously at consciously.live: generate guided meditations, keep a personal library, and journal with smart insights—all in one place.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          rel="preload"
          href={HOME_HERO_PATTERN_LIGHT}
          as="image"
          fetchPriority="high"
        />
        <link
          rel="preload"
          href={HOME_HERO_PATTERN_DARK}
          as="image"
        />
        <style dangerouslySetInnerHTML={{ __html: themeRootCss }} />
        <style dangerouslySetInnerHTML={{ __html: homeHeroPatternCriticalCss }} />
      </head>
      <body
        suppressHydrationWarning
        className={`${dmSans.variable} ${instrumentSans.variable} ${fraunces.variable} ${caveat.variable} flex h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground antialiased`}
      >
        <ColorSchemeBoot />
        <LibraryPlayerProvider>
          <Suspense fallback={null}>
            <ProfileNameGate />
          </Suspense>
          <AppChromeHost>{children}</AppChromeHost>
        </LibraryPlayerProvider>
      </body>
    </html>
  );
}
