"use client";

import "@/components/home-v2/home-v2.css";
import "@/components/new-home/new-home.css";
import { NewHomeHero, NewHomeScrollCue } from "@/components/new-home/new-home-hero";
import { PreviewProvider } from "@/components/new-home/new-home-preview";
import { NewHomeSections } from "@/components/new-home/new-home-sections";
import { WaitlistProvider } from "@/components/new-home/waitlist-modal";

export function NewHomePage({ phone = false }: { phone?: boolean }) {
  return (
    <PreviewProvider>
      <WaitlistProvider>
        <div className={`home-v2 new-home${phone ? " is-phone" : ""}`}>
          <NewHomeHero phone={phone} />
          <NewHomeSections />
          <NewHomeScrollCue />
        </div>
      </WaitlistProvider>
    </PreviewProvider>
  );
}
