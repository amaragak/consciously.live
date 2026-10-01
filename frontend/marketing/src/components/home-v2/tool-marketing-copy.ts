import type { HomeV2ToolId } from "@/components/home-v2/constants";
import type { ToolMarketingVignetteId } from "@/components/home-v2/tool-vignettes";
import { MEDITATION_STYLE_LABELS } from "@/lib/meditation-style-intake";

const MEDITATION_STYLE_COUNT = MEDITATION_STYLE_LABELS.length;

/** One full-bleed band on a tool marketing page. */
export type ToolMarketingStrip = {
  headline: string;
  support: string;
  vignette: ToolMarketingVignetteId;
  /** Compact tags (e.g. meditation styles) instead of title/body points. */
  examples?: readonly string[];
  points: readonly { title: string; body: string }[];
};

export type ToolMarketingCopy = {
  eyebrow: string;
  headline: string;
  support: string;
  strips: readonly ToolMarketingStrip[];
};

export const TOOL_MARKETING: Record<HomeV2ToolId, ToolMarketingCopy> = {
  meditate: {
    eyebrow: "Meditate",
    headline: "Personalised guided meditations that sound great.",
    support: "Try it for yourself",
    strips: [
      {
        headline: `Pick from ${MEDITATION_STYLE_COUNT} meditation styles.`,
        support: "Choose a type, answer a few questions, generate.",
        vignette: "meditate-bytype",
        examples: MEDITATION_STYLE_LABELS,
        points: [],
      },
      {
        headline: "Free flow chat.",
        support:
          "When you want to get really specific — talk it through first, then generate a session from the thread.",
        vignette: "meditate-chat",
        points: [
          {
            title: "Go deep on the detail",
            body: "Name the doubt, the decision, the exact knot. No style chip forced up front.",
          },
          {
            title: "Then sit with what you said",
            body: "The meditation grows out of the conversation — not a form you filled for someone else’s use case.",
          },
        ],
      },
      {
        headline: "Make a program your own.",
        support:
          "Curated guided courses — one lesson at a time. Explore the ready audio, or Make it your own and generate a fresh meditation shaped around you.",
        vignette: "meditate-programs",
        points: [
          {
            title: "Explore course",
            body: "In Library → Programs, listen to each lesson as published — ordered sessions with their own ready audio.",
          },
          {
            title: "Make it your own",
            body: "Create → By Program: pick a course, choose sessions, answer the customization intake in chat, then generate new meditation(s) for you.",
          },
        ],
      },
      {
        headline: "Move towards a goal.",
        support:
          "From Manifest: pick a life area — optionally focus on one goal — for a visualization grounded in your dream and blockers.",
        vignette: "meditate-goal",
        points: [
          {
            title: "From Goal",
            body: "Manifest holds the aspiration and To Dos; Create writes a visualisation aimed at that outcome.",
          },
          {
            title: "Also from Manifest",
            body: "On a life-area page you can Generate meditation straight into Create — same goal thread, fewer steps.",
          },
        ],
      },
      {
        headline: "Reflect on a journal entry.",
        support:
          "Use a saved entry as context for your meditation — the Reflect path under Create, or Generate meditation from a journal page.",
        vignette: "meditate-journal",
        points: [
          {
            title: "From Journal",
            body: "Heavy entry, hopeful entry, half-finished rant — turn the page you already wrote into something you can listen to.",
          },
          {
            title: "From Insights too",
            body: "Weekly reflection and thought cards can hand you into a one-shot prompt prefilled from what showed up.",
          },
        ],
      },
      {
        headline: "One-shot prompt.",
        support:
          "Write what you want once — straight to the script generator, no coaching chat. The same path the homepage prompt uses.",
        vignette: "meditate-oneshot",
        points: [
          {
            title: "Direct",
            body: "Say it plainly, generate, listen. No style picker or intake required up front.",
          },
          {
            title: "Or Random Script",
            body: "Skip the chat and jump straight to audio with a random style and seed script — when you just want to sit.",
          },
        ],
      },
    ],
  },
  journal: {
    eyebrow: "Journal",
    headline: "Hear what you’ve been telling yourself.",
    support: "Write freely — or bring the pages you already have.",
    strips: [
      {
        headline: "A private page for what’s actually going on.",
        support:
          "Write when the words need care. Speak when it’s faster — we transcribe so the tone isn’t lost. Same journal either way.",
        vignette: "journal-write",
        points: [
          {
            title: "Text entries",
            body: "A quiet page for the sentences you want to keep exactly as they landed.",
          },
          {
            title: "Voice transcription",
            body: "Talk the day in; the clip stays with the entry, and the words are there when you need them.",
          },
        ],
      },
      {
        headline: "Bring the journal you already keep.",
        support:
          "Photograph handwritten pages and let AI turn them into text you can edit — or import Day One, Markdown, CSV, and PDF annotations.",
        vignette: "journal-import",
        points: [
          {
            title: "Handwritten photos",
            body: "Snap pages from a paper notebook. We read the handwriting; you review the words before anything is saved.",
          },
          {
            title: "Day One and more",
            body: "Import a Day One export, Markdown or text files, CSV, or PDF highlights — then keep writing in one place.",
          },
        ],
      },
      {
        headline: "Insights over weeks.",
        support:
          "The doubts that keep returning, and the dreams that won’t go away — made visible.",
        vignette: "journal-patterns",
        points: [
          {
            title: "Patterns this month",
            body: "Theme and mood views built from your own writing — private, for you.",
          },
          {
            title: "Make a meditation for this thought",
            body: "Thought cards and the weekly letter can hand you into Create with a prompt already filled.",
          },
        ],
      },
      {
        headline: "Gratitudes beside the hard days.",
        support: "What’s good, logged next to everything else — same practice, same timeline.",
        vignette: "journal-gratitudes",
        points: [
          {
            title: "Gratitudes",
            body: "Capture the small win in the moment so it doesn’t evaporate by evening.",
          },
          {
            title: "Same history",
            body: "When you look back, the thanks and the struggles share one thread.",
          },
        ],
      },
      {
        headline: "From entry to guided session.",
        support:
          "When a page is heavy or hopeful, generate a meditation written from that entry.",
        vignette: "journal-meditate",
        points: [
          {
            title: "Generate meditation",
            body: "Don’t re-explain yourself to a blank prompt. The session already has the page.",
          },
          {
            title: "Connect to life area",
            body: "Tie an entry to Manifest when the writing belongs to a goal you’re tracking.",
          },
        ],
      },
    ],
  },
  manifest: {
    eyebrow: "Manifest",
    headline: "Know exactly who you’re becoming.",
    support: "Picture it. Name the standards. Take the next step.",
    strips: [
      {
        headline: "Vision board.",
        support: "Scenes of the life you’re building — concrete enough to feel.",
        vignette: "manifest-board",
        points: [
          {
            title: "Collect what you’re becoming",
            body: "Pin the images that make the goal visceral. Revisit when motivation is thin.",
          },
          {
            title: "Beside the plan",
            body: "It lives next to your manifesto and goals, so the picture and the plan stay attached.",
          },
        ],
      },
      {
        headline: "Manifesto.",
        support: "The lines you’ll recognise when the week gets noisy.",
        vignette: "manifest-manifesto",
        points: [
          {
            title: "Principles in your voice",
            body: "Write the standards you’ll feel when you’re about to compromise what mattered.",
          },
          {
            title: "Values and quotes too",
            body: "Values, meaningful quotes, and questions to yourself — the quieter layer under the goals.",
          },
        ],
      },
      {
        headline: "Goals and To Dos.",
        support: "Break the ambition into moves small enough to begin today.",
        vignette: "manifest-goals",
        points: [
          {
            title: "Plan next steps",
            body: "Each goal opens into To Dos you can actually start.",
          },
          {
            title: "Obstacles named",
            body: "Surface the fear or friction so the plan isn’t only optimistic checkboxes.",
          },
        ],
      },
      {
        headline: "Feel it. Then do it.",
        support:
          "Generate a visualisation from a goal, or start a Focus session on the To Dos.",
        vignette: "manifest-handoff",
        points: [
          {
            title: "Generate meditation",
            body: "A visualisation grounded in the dream and blockers.",
          },
          {
            title: "Start focus session",
            body: "Protect an hour for the next step. Optionally set the tone first with a short visualisation.",
          },
        ],
      },
    ],
  },
  focus: {
    eyebrow: "Focus",
    headline: "Give your hours to your dream.",
    support: "Pick the step. Start the timer. Stay with it.",
    strips: [
      {
        headline: "Start from the To Dos that matter.",
        support: "The next concrete move on a goal you already set in Manifest.",
        vignette: "focus-step",
        points: [
          {
            title: "Goal-linked sessions",
            body: "Choose the tasks, then start. When the bell rings, you’re still inside that goal.",
          },
          {
            title: "No hunting for what to do",
            body: "The queue is the plan — not a fresh decision every time you sit down.",
          },
        ],
      },
      {
        headline: "Distraction blocking for the session.",
        support:
          "Sites that pull you away stay blocked until the timer ends.",
        vignette: "focus-blocking",
        points: [
          {
            title: "breath+work for Chrome",
            body: "Block the usual traps while the session runs.",
          },
          {
            title: "Until the session ends",
            body: "The boundary lasts as long as you asked the clock to hold.",
          },
        ],
      },
      {
        headline: "Set the tone first?",
        support:
          "Optional short visualisation before the block — then Focus sounds while you work.",
        vignette: "focus-lengths",
        points: [
          {
            title: "Yes, generate 2‑min meditation",
            body: "Feel the outcome, then protect the hour.",
          },
          {
            title: "Focus sounds",
            body: "Mix the room while the clock runs. Length is flexible; the doorway stays the To Do.",
          },
        ],
      },
      {
        headline: "Close the loop on the goal.",
        support: "Note the progress. Queue the next block while it’s still warm.",
        vignette: "focus-close",
        points: [
          {
            title: "Progress on the goal",
            body: "The win is movement on the To Dos — not the timer alone.",
          },
          {
            title: "Ready for tomorrow",
            body: "Leave the next session queued so starting again costs less willpower.",
          },
        ],
      },
    ],
  },
  chat: {
    eyebrow: "Chat",
    headline: "Never stuck in your own head.",
    support: "Think out loud. It listens — and it acts.",
    strips: [
      {
        headline: "Conversation with context.",
        support:
          "Answers grounded in your journal and goals — not a generic pep talk.",
        vignette: "chat-context",
        points: [
          {
            title: "Grounded in your thread",
            body: "Goals and journal context keep the reply attached to your actual week.",
          },
          {
            title: "When you’re circling",
            body: "Name the loop. Get it reflected clearly before you choose a move.",
          },
        ],
      },
      {
        headline: "Actions, not only advice.",
        support:
          "Log a gratitude, add a Manifest step, or start a meditation from the same chat.",
        vignette: "chat-actions",
        points: [
          {
            title: "Log and plan in-place",
            body: "Capture the win or the next step without leaving the conversation.",
          },
          {
            title: "Open Create Meditation",
            body: "When sitting would help more than more talk, hand off into Free flow chat.",
          },
        ],
      },
      {
        headline: "One doorway when you don’t know which tool.",
        support: "Start here. Then go to Journal, Manifest, Focus, or Meditate.",
        vignette: "chat-doorway",
        points: [
          {
            title: "Orient first",
            body: "Say what’s stuck. Get options that map to the right practice.",
          },
          {
            title: "Then go deep",
            body: "Open the tool with context already carried — less re-explaining yourself.",
          },
        ],
      },
      {
        headline: "Stay with the long arc.",
        support: "Pick up mid-doubt or mid-celebration. The thread remembers.",
        vignette: "chat-arc",
        points: [
          {
            title: "Tied to the suite",
            body: "The same goals and pages you use elsewhere show up here as fuel for the reply.",
          },
          {
            title: "New chat anytime",
            body: "The conversation is part of the practice — not a side chatbot you abandon.",
          },
        ],
      },
    ],
  },
};
