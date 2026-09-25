export type HomeV2ToolId =
  | "meditate"
  | "journal"
  | "manifest"
  | "focus"
  | "chat";

export const HOME_V2_TOOLS: readonly {
  id: HomeV2ToolId;
  label: string;
  href: string;
  ctaLabel: string;
  stickyCta: string;
}[] = [
  {
    id: "meditate",
    label: "Meditate",
    href: "/meditate",
    ctaLabel: "Create a meditation →",
    stickyCta: "Create a meditation",
  },
  {
    id: "journal",
    label: "Journal",
    href: "/journal",
    ctaLabel: "Write your first entry →",
    stickyCta: "Write an entry",
  },
  {
    id: "manifest",
    label: "Manifest",
    href: "/manifest",
    ctaLabel: "Build your vision board →",
    stickyCta: "Build your vision board",
  },
  {
    id: "focus",
    label: "Focus",
    href: "/focus",
    ctaLabel: "Start a focus session →",
    stickyCta: "Start a focus session",
  },
  {
    id: "chat",
    label: "Chat",
    href: "/chat",
    ctaLabel: "Talk to your coach →",
    stickyCta: "Talk to your coach",
  },
] as const;

/** Listen → community library (no dedicated /listen index today). */
export const HOME_V2_LISTEN_HREF = "/library";
export const HOME_V2_READ_HREF = "/read";
export const HOME_V2_CONNECT_HREF = "/connect";
export const HOME_V2_START_FREE_HREF = "/login?mode=signup";
export const HOME_V2_INSTAGRAM_HREF =
  "https://www.instagram.com/consciously.live/";

export const HOME_V2_START_ELSEWHERE = [
  {
    href: "/manifest",
    title: "Build your vision board",
    body: "Picture the life you're creating, write your manifesto and set your goals.",
    bodyMobile: "Picture the life you're creating.",
    tool: "Manifest",
  },
  {
    href: "/journal",
    title: "Write in your journal",
    body: "Write or speak freely, and see the patterns in how you feel over time.",
    bodyMobile: "See the patterns in how you feel.",
    tool: "Journal",
  },
  {
    href: "/focus",
    title: "Start a focus session",
    body: "A timer for the steps towards your goals, with distracting sites blocked.",
    bodyMobile: "A timer for your goals, no distractions.",
    tool: "Focus",
  },
  {
    href: "/chat",
    title: "Talk to your coach",
    body: "Think out loud, and let it log, plan or start a meditation for you.",
    bodyMobile: "Think out loud; it acts for you.",
    tool: "Chat",
  },
] as const;
