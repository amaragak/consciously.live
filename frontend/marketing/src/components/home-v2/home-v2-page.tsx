"use client";

import { useRef } from "react";
import "@/components/home-v2/home-v2.css";
import { FinalCta } from "@/components/home-v2/final-cta";
import { HeroSection } from "@/components/home-v2/hero-section";
import {
  HomeV2Chrome,
  useHomeV2HeaderScrolled,
} from "@/components/home-v2/home-v2-scroll-chrome";
import { ToolLoopSection } from "@/components/home-v2/tool-loop-section";
import { ToolSection } from "@/components/home-v2/tool-section";
import { TypesSection } from "@/components/home-v2/types-section";
import { useHomeV2Scroll } from "@/components/home-v2/use-home-v2-scroll";

export function HomeV2Page() {
  const rootRef = useRef<HTMLDivElement>(null);
  const { motionReady } = useHomeV2Scroll(rootRef);
  const scrolled = useHomeV2HeaderScrolled(rootRef);

  return (
    <div ref={rootRef} className="home-v2 relative w-full">
      <HomeV2Chrome scrolled={scrolled} />
      <HeroSection motionReady={motionReady} />
      <section className="home-v2-band home-v2-band--b border-t border-[var(--hv2-hero-hairline)] px-5 pb-8 pt-7 md:hidden">
        <TypesSection motionReady={motionReady} />
      </section>
      <ToolLoopSection />
      <section className="home-v2-band home-v2-band--b">
        <ToolSection tool="meditate" />
      </section>
      <section className="home-v2-band home-v2-band--a">
        <ToolSection tool="journal" visualLeft />
      </section>
      <section className="home-v2-band home-v2-band--d">
        <ToolSection tool="manifest" />
      </section>
      <section className="home-v2-band home-v2-band--c">
        <ToolSection tool="focus" visualLeft />
      </section>
      <section className="home-v2-band home-v2-band--b">
        <ToolSection tool="chat" />
      </section>
      <FinalCta />
    </div>
  );
}
