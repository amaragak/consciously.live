import type { HomeV2ToolId } from "@/components/home-v2/constants";
import type { ToolMarketingVignetteId } from "@/components/home-v2/tool-vignettes";

/** One full-bleed band on a tool marketing page. */
export type ToolMarketingStrip = {
  headline: string;
  support: string;
  vignette: ToolMarketingVignetteId;
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
        headline: "Pick a meditation style.",
        support:
          "By type: choose a type, then answer a few questions shaped around what you need today — manifestation, visualisation, sleep, and more.",
        vignette: "meditate-bytype",
        points: [
          {
            title: "By type",
            body: "Start from the form of practice you want. The intake keeps the script inside that style while still sounding like you.",
          },
          {
            title: "Then generate",
            body: "Questions → script → voice and mix. Same Generate meditation finish as every other Create path.",
          },
        ],
      },
      {
        headline: "Free flow chat.",
        support:
          "Start from mood and what’s on your mind — open, journal-style questions. No style chip forced up front.",
        vignette: "meditate-chat",
        points: [
          {
            title: "Chat",
            body: "Talk it through. The meditation grows out of the conversation, not a form you filled for someone else’s use case.",
          },
          {
            title: "When you’re circling",
            body: "Doubt, decision, or restless energy — name it in dialogue, then sit with a script that heard you first.",
          },
        ],
      },
      {
        headline: "Make a program your own.",
        support:
          "Programs are curated guided courses — one lesson at a time. Take Chakra Cleanse: explore the ready audio from root to crown, or Make it your own and generate a fresh meditation shaped around you.",
        vignette: "meditate-programs",
        points: [
          {
            title: "Explore course",
            body: "In Library → Programs, listen to Chakra Cleanse as published — Introduction, then Root through Crown — each lesson with its own ready audio, color, and theme.",
          },
          {
            title: "Make it your own",
            body: "Create → By Program: pick Chakra Cleanse, choose sessions (e.g. Root, Heart), answer the customization intake in chat — what’s unsteady, what’s weighing on the heart — then generate new meditation(s) for you.",
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
    headline: "A private notebook that notices what you keep repeating.",
    support:
      "Three tabs under Journal: your entries, Gratitudes, and Insights. Write or speak; when a page asks for more than ink, Generate meditation into Create.",
    strips: [
      {
        headline: "Write when you need precision. Speak when you don’t.",
        support:
          "Same journal, two inputs — type the careful paragraph, or dump the day out loud when your hands are full.",
        vignette: "journal-write",
        points: [
          {
            title: "New entry",
            body: "A quiet page for the sentences you want to keep exactly as they landed.",
          },
          {
            title: "Voice when it’s faster",
            body: "Talk it in; keep the clip with the entry so the tone isn’t lost in a summary.",
          },
        ],
      },
      {
        headline: "Insights, not just pages.",
        support:
          "Insights surfaces the loops — weekly letter, mood, pattern cards — so “I’ve been here before” is visible without homework.",
        vignette: "journal-patterns",
        points: [
          {
            title: "Patterns this month",
            body: "Theme and mood views built from your own writing — private, for you, not a feed.",
          },
          {
            title: "Make a meditation for this thought",
            body: "Thought cards and the weekly reflection can hand you into Create with a one-shot prompt already filled.",
          },
        ],
      },
      {
        headline: "Gratitudes beside the hard days.",
        support:
          "Daily gratitudes live as their own tab next to Journal — not a separate app you forget.",
        vignette: "journal-gratitudes",
        points: [
          {
            title: "Gratitudes",
            body: "Capture the small win in the moment so it doesn’t evaporate by evening.",
          },
          {
            title: "Same history",
            body: "When you look back, the thanks and the struggles share one practice.",
          },
        ],
      },
      {
        headline: "Generate meditation from an entry.",
        support:
          "From the entry chrome, or Create → Reflect on a journal entry — use a saved page as context for the session.",
        vignette: "journal-meditate",
        points: [
          {
            title: "Generate meditation",
            body: "Don’t re-explain yourself to a blank prompt. The session already has the context of the page.",
          },
          {
            title: "Connect to life area",
            body: "Tie an entry to Manifest when the writing belongs to a goal you’re already tracking.",
          },
        ],
      },
    ],
  },
  manifest: {
    eyebrow: "Manifest",
    headline: "Vision, manifesto, and next steps — not vision alone.",
    support:
      "Vision board, Manifesto, and your life areas with goals and To Dos. From a goal: Plan next steps, Generate meditation, or Start focus session on these To Dos.",
    strips: [
      {
        headline: "Vision board.",
        support:
          "Images and captions for the life you’re building — so the future isn’t a vague mood.",
        vignette: "manifest-board",
        points: [
          {
            title: "Collect what you’re becoming",
            body: "Pin the scenes that make the goal visceral. Revisit when motivation is thin.",
          },
          {
            title: "Beside the plan",
            body: "It lives next to Manifesto and life-area goals, so the picture and the plan stay attached.",
          },
        ],
      },
      {
        headline: "Manifesto.",
        support:
          "Name the standards you’re living by — the north star for decisions when the week gets noisy.",
        vignette: "manifest-manifesto",
        points: [
          {
            title: "Principles in your voice",
            body: "Write the lines you’ll recognise when you’re about to compromise what you said mattered.",
          },
          {
            title: "Values and quotes too",
            body: "Home also holds Values, Meaningful quotes, and Questions to yourself — the quieter layer under the goals.",
          },
        ],
      },
      {
        headline: "Goals and To Dos in your life areas.",
        support:
          "Break ambitions into moves you can actually start — and name what’s blocking you underneath.",
        vignette: "manifest-goals",
        points: [
          {
            title: "Plan next steps",
            body: "Each goal opens into To Dos small enough to begin today.",
          },
          {
            title: "Obstacles named",
            body: "Surface the fear or friction so the plan isn’t only optimistic checkboxes.",
          },
        ],
      },
      {
        headline: "Generate meditation. Start focus.",
        support:
          "From a goal: Generate meditation into Create, or Start focus session on these To Dos — same aspiration, different container.",
        vignette: "manifest-handoff",
        points: [
          {
            title: "Generate meditation",
            body: "A visualisation grounded in the dream and blockers — or Free flow chat when you hand off from a life area.",
          },
          {
            title: "Start focus session",
            body: "Protect an hour on the To Dos. Optionally set the tone first with a short visualisation before the timer.",
          },
        ],
      },
    ],
  },
  focus: {
    eyebrow: "Focus",
    headline: "A timer attached to the goal — not a blank Pomodoro.",
    support:
      "Start from Manifest To Dos, run the timer with Focus sounds, and keep distracting sites blocked until the session ends. Optionally set the tone first with a short visualisation.",
    strips: [
      {
        headline: "Start from the To Dos that matter.",
        support:
          "Focus isn’t “work somehow.” It’s the next concrete move on a goal you already set in Manifest.",
        vignette: "focus-step",
        points: [
          {
            title: "Start focus session on these To Dos",
            body: "Choose the tasks, then start. When the bell rings, you’re still inside that goal thread.",
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
          "With the browser extension, sites that pull you away stay blocked for the length of the block — the container is real.",
        vignette: "focus-blocking",
        points: [
          {
            title: "breath+work for Chrome",
            body: "Block the usual traps while the timer runs. The boundary is the product.",
          },
          {
            title: "Until the session ends",
            body: "Not a gentle suggestion — the block lasts as long as you asked the clock to hold.",
          },
        ],
      },
      {
        headline: "Set the tone first?",
        support:
          "Before deep work, you can generate a short visualisation meditation — then sit down to the timer with Focus sounds.",
        vignette: "focus-lengths",
        points: [
          {
            title: "Yes, generate 2‑min meditation",
            body: "Optional preflight from the goal — feel the outcome, then protect the hour.",
          },
          {
            title: "Focus sounds",
            body: "Mix the room while the clock runs. Length is flexible; the doorway stays the To Do.",
          },
        ],
      },
      {
        headline: "Close the loop on the goal.",
        support:
          "Finish the block, note progress on the Manifest step, and line up the next session while the thread is still warm.",
        vignette: "focus-close",
        points: [
          {
            title: "Progress on the goal",
            body: "The timer isn’t the win — movement on the To Dos is.",
          },
          {
            title: "Ready for tomorrow",
            body: "Leave the next block queued so starting again costs less willpower.",
          },
        ],
      },
    ],
  },
  chat: {
    eyebrow: "Chat",
    headline: "A coach that can also run Consciously.",
    support:
      "Think out loud in New chat. Get reflection grounded in your journal and goals — then navigate into Create, Journal, Manifest, or Focus without opening five other screens.",
    strips: [
      {
        headline: "Conversation with context.",
        support:
          "Bring the doubt or the decision. The coach answers against the life you’re already tracking — not a generic pep talk.",
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
          "From the same chat: log a gratitude, add a Manifest step, or open Create Meditation from-chat for the knot you just named.",
        vignette: "chat-actions",
        points: [
          {
            title: "Log and plan in-place",
            body: "Capture the win or the next step without leaving the conversation.",
          },
          {
            title: "Open Create Meditation",
            body: "When sitting would help more than more talk, hand off into Free flow chat with the thread already warm.",
          },
        ],
      },
      {
        headline: "One doorway when you don’t know which tool.",
        support:
          "Unsure whether to journal, plan, or sit? Start in Chat and let it route you — then hand off into the right practice.",
        vignette: "chat-doorway",
        points: [
          {
            title: "Orient first",
            body: "Say what’s stuck. Get options that map to Journal, Manifest, Focus, or Meditate Create.",
          },
          {
            title: "Then go deep",
            body: "Open the tool with context already carried — less re-explaining yourself.",
          },
        ],
      },
      {
        headline: "Stay with the long arc.",
        support:
          "Threads you can return to — mid-doubt or mid-celebration — tied to the same goals and pages you use elsewhere.",
        vignette: "chat-arc",
        points: [
          {
            title: "Tied to the suite",
            body: "The same goals and pages you use elsewhere show up here as fuel for the reply.",
          },
          {
            title: "New chat anytime",
            body: "Pick up mid-doubt or mid-celebration. The thread is part of the practice, not a side chat.",
          },
        ],
      },
    ],
  },
};
