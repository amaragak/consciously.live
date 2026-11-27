"use client";

import "@/components/home-v2/home-v2.css";
import "@/components/new-home/new-home.css";
import "./newhome-story.css";
import { NewHomeHero } from "@/components/new-home/new-home-hero";
import { PreviewProvider } from "@/components/new-home/new-home-preview";
import { ProblemBand } from "@/components/new-home/new-home-story-sections";
import { WaitlistProvider } from "@/components/new-home/waitlist-modal";
import { StoryChapters } from "./story-chapters";
import { StoryConnected } from "./story-connected";
import {
  StoryFinalCta,
  StoryFounder,
  StoryIntro,
} from "./story-sections";

/**
 * Story-led homepage at /newhome.
 * Header + hero mount exactly like `/` (same providers + NewHomeHero on the
 * `.home-v2.new-home` root). Story CSS (`.ns`) only wraps the bands below
 * so it cannot restyle or remount the input / feature strip.
 */
export function NewhomeStoryPage({ phone = false }: { phone?: boolean }) {
  return (
    <PreviewProvider>
      <WaitlistProvider>
        <div className={`home-v2 new-home${phone ? " is-phone" : ""}`}>
          <NewHomeHero phone={phone} />
          <div className="ns">
            <ProblemBand />
            <StoryIntro />
            <StoryChapters />
            <StoryConnected />
            <StoryFounder />
            <StoryFinalCta />
          </div>
        </div>
      </WaitlistProvider>
    </PreviewProvider>
  );
}
