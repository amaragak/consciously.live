"use client";

import { useRef } from "react";
import "@/components/home-v2/home-v2.css";
import { FinalCta } from "@/components/home-v2/final-cta";
import { HeroSection } from "@/components/home-v2/hero-section";
import { StickyToolHeader } from "@/components/home-v2/sticky-tool-header";
import { ToolLoopSection } from "@/components/home-v2/tool-loop-section";
import { ToolSection } from "@/components/home-v2/tool-section";
import { useHomeV2Scroll } from "@/components/home-v2/use-home-v2-scroll";

export function HomeV2Page() {
  const rootRef = useRef<HTMLDivElement>(null);
  const { stuck, activeTool, motionReady } = useHomeV2Scroll(rootRef);

  return (
    <div ref={rootRef} className="home-v2 w-full">
      <StickyToolHeader stuck={stuck} activeTool={activeTool} />
      <HeroSection motionReady={motionReady} />
      <ToolLoopSection />
      <section className="home-v2-band home-v2-band--c">
        <ToolSection tool="meditate" />
      </section>
      <section className="home-v2-band home-v2-band--d">
        <ToolSection tool="journal" visualLeft />
      </section>
      <section className="home-v2-band home-v2-band--ideate">
        <ToolSection tool="manifest" />
      </section>
      <section className="home-v2-band home-v2-band--a">
        <ToolSection tool="focus" visualLeft />
      </section>
      <section className="home-v2-band home-v2-band--d">
        <ToolSection tool="chat" />
      </section>
      <div className="home-v2-band home-v2-band--b py-10 md:py-16">
        <FinalCta />
      </div>
    </div>
  );
}
