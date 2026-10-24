const CDN = "https://d3k8rq6eqba40d.cloudfront.net";

export type Sample = {
  title: string;
  style: string;
  minutes: string;
  cover: string;
  audio: string;
  speaker: string;
};

export const SAMPLES = {
  chat: {
    title: "Following Your Breath Through the Scatter",
    style: "Breath-led",
    minutes: "2 min",
    cover: `${CDN}/meditation-covers/_/b3f239a6-5528-448e-bb70-409637c4b6c3.jpg`,
    audio: `${CDN}/meditations/_/0e3a06f4-cbd8-4c33-a067-f1e30c41db72.m4a`,
    speaker: "Alan Watts",
  },
  journal: {
    title: "Softening the Grip: A Practice in Self-Compassion",
    style: "Loving-kindness",
    minutes: "2 min",
    cover: `${CDN}/meditation-covers/_/04fa5b91-fa0c-4351-b68d-00ee172e70b0.jpg`,
    audio: `${CDN}/meditations/_/4ad91230-4ad0-4f34-9521-01bb2c32860a.m4a`,
    speaker: "Deep Soothing",
  },
  goal: {
    title: "Lila and the One: Divine Play at Rest",
    style: "Tell me a zen bedtime story",
    minutes: "2 min",
    cover: `${CDN}/meditation-covers/_/694d2fbe-3a39-4530-aca2-a75cdb92d2d1.jpg`,
    audio: `${CDN}/meditations/0ad0645c-cc42-4d11-a84b-b56304142150.m4a`,
    speaker: "Alan Watts",
  },
  heal: {
    title: "Full Body Scan: Release Tension and Find Inner Peace",
    style: "Body scan",
    minutes: "4 min",
    cover: `${CDN}/meditation-covers/_/d709dad9-c7d2-40ab-86d3-60e1b38c9d00.jpg`,
    audio: `${CDN}/meditations/_/62af7ea0-33ea-43f4-ad46-4aabc748bbe0.m4a`,
    speaker: "Brit Monk",
  },
  hero: {
    title: "The Small Stone: Finding Safety in Stillness",
    style: "Story",
    minutes: "4 min",
    cover: `${CDN}/meditation-covers/bf93d0e7-a478-4d57-8f6c-2f874f90ea81/027aa1fb-8265-418c-aa44-d7f59538956c.jpg`,
    audio: `${CDN}/meditations/bf93d0e7-a478-4d57-8f6c-2f874f90ea81/c163c39a-f97c-4f3e-b897-be08b01874c8.m4a`,
    speaker: "Benjamin",
  },
} as const satisfies Record<string, Sample>;

export const STYLES = [
  ["Body scan", "body-scan-1792449628579"],
  ["Visualization", "visualization-1792449647092"],
  ["Breath-led", "breath-led-1792449664007"],
  ["Manifestation", "manifestation-1792449680655"],
  ["Affirmation loop", "affirmation-loop-1792449697503"],
  ["Story", "story-1792449713793"],
  ["Reflection", "reflection-1792449730633"],
  ["Sleep", "sleep-1792449746726"],
  ["Loving-kindness", "loving-kindness-1792449764481"],
  ["Anxiety relief", "anxiety-relief-1792449781590"],
  ["Movement meditation", "movement-meditation-1792449797985"],
  ["Open awareness", "open-awareness-1792449813510"],
] as const;

export function styleImage(file: string) {
  return `${CDN}/category-covers/${file}.jpg`;
}

export const PROGRAMS_HREF = "/meditate/library/programs";

export const FEATURED_PROGRAMS = [
  {
    title: "Chakra Cleanse",
    sessions: "7 sessions · one for each centre",
    href: "/meditate/library/programs/chakra-cleanse",
    cover: `${CDN}/program-covers/8b12769e-9c49-4a4c-b19d-0c74811d4020/program-1792451704296.jpg`,
    chakras: true,
  },
  {
    title: "Sleep Reset",
    sessions: "6 sessions",
    href: "/meditate/library/programs/sleep-reset",
    cover: `${CDN}/program-covers/ff329c14-a828-435f-816f-b603eeb8d972/program-1792451684125.jpg`,
    chakras: false,
  },
  {
    title: "Four Directions of Self-Compassion",
    sessions: "5 sessions",
    href: "/meditate/library/programs/four-directions-of-self-compassion",
    cover: `${CDN}/program-covers/55b22e29-e6e5-456b-a475-cbd709c46e45/program-1792451684816.jpg`,
    chakras: false,
  },
  {
    title: "Confidence Rebuild",
    sessions: "6 sessions",
    href: "/meditate/library/programs/confidence-rebuild",
    cover: `${CDN}/program-covers/871f4259-1dd1-4d91-be74-59db17f53a82/program-1792451701922.jpg`,
    chakras: false,
  },
] as const;

/** Our Picks from the soundscape catalog, each with its own cover. */
export const SOUNDS = [
  {
    name: "Astral Secrets",
    category: "Soundscape",
    audio: `${CDN}/background-audio/Astral-Secrets.m4a`,
    art: `${CDN}/composition-covers/Astral-Secrets-1792454648320.jpg`,
  },
  {
    name: "Celestial Chamber",
    category: "Soundscape",
    audio: `${CDN}/background-audio/Celestial-Chamber.m4a`,
    art: `${CDN}/composition-covers/Celestial-Chamber-1792454682010.jpg`,
  },
  {
    name: "Chinese Miracle Mountain Lake",
    category: "Soundscape",
    audio: `${CDN}/background-audio/Chinese-Miracle-at-a-Mountain-Lake-with-Solfeggio-528Hz.m4a`,
    art: `${CDN}/composition-covers/Chinese-Miracle-at-a-Mountain-Lake-with-Solfeggio-528Hz-1792454699435.jpg`,
  },
  {
    name: "Clearing Subconscious Negativity",
    category: "Soundscape",
    audio: `${CDN}/background-audio/Clearing-Subconscious-Negativity-Meditation-Music-for-Positive-Energy-Healing-Music.m4a`,
    art: `${CDN}/composition-covers/Clearing-Subconscious-Negativity-Meditation-Music-for-Positive-Energy-Healing-Music-1792454717491.jpg`,
  },
  {
    name: "Deep Stillness",
    category: "Soundscape",
    audio: `${CDN}/background-audio/Deep-Stillness-Delta-3-Hz-Carrier-432-Hz.m4a`,
    art: `${CDN}/composition-covers/Deep-Stillness-Delta-3-Hz-Carrier-432-Hz-1792454769770.jpg`,
  },
  {
    name: "Echoes of the Ancients",
    category: "Soundscape",
    audio: `${CDN}/background-audio/Echoes-of-the-Ancients.m4a`,
    art: `${CDN}/composition-covers/Echoes-of-the-Ancients-1792454804191.jpg`,
  },
  {
    name: "Enchanted Echoes",
    category: "Soundscape",
    audio: `${CDN}/background-audio/Enchanted-Echoes.m4a`,
    art: `${CDN}/composition-covers/Enchanted-Echoes-1792454821676.jpg`,
  },
  {
    name: "Gazing Beyond Sea",
    category: "Soundscape",
    audio: `${CDN}/background-audio/Gazing-Far-Beyond-the-Sea-of-Possibilities.m4a`,
    art: `${CDN}/composition-covers/Gazing-Far-Beyond-the-Sea-of-Possibilities-1792454874528.jpg`,
  },
  {
    name: "Grounded Essence",
    category: "Soundscape",
    audio: `${CDN}/background-audio/Grounded-Essence.m4a`,
    art: `${CDN}/composition-covers/Grounded-Essence-1792454910552.jpg`,
  },
  {
    name: "Grounded in the Forest",
    category: "Soundscape",
    audio: `${CDN}/background-audio/Grounded-in-the-Forest.m4a`,
    art: `${CDN}/composition-covers/Grounded-in-the-Forest-1792454927097.jpg`,
  },
  {
    name: "Portal of Light",
    category: "Soundscape",
    audio: `${CDN}/background-audio/Portal-of-Light.m4a`,
    art: `${CDN}/composition-covers/Portal-of-Light-1792455244094.jpg`,
  },
  {
    name: "Pure Serenity",
    category: "Soundscape",
    audio: `${CDN}/background-audio/Pure-Serenity.m4a`,
    art: `${CDN}/composition-covers/Pure-Serenity-1792455277793.jpg`,
  },
  {
    name: "Roman Body Regeneration",
    category: "Soundscape",
    audio: `${CDN}/background-audio/Roman-Body-Regeneration.m4a`,
    art: `${CDN}/composition-covers/Roman-Body-Regeneration-1792455380399.jpg`,
  },
  {
    name: "Sunrise Flow",
    category: "Soundscape",
    audio: `${CDN}/background-audio/Sunrise-Flow.m4a`,
    art: `${CDN}/composition-covers/Sunrise-Flow-1792455574792.jpg`,
  },
  {
    name: "The Cosmic Key",
    category: "Soundscape",
    audio: `${CDN}/background-audio/The-Cosmic-Key.m4a`,
    art: `${CDN}/composition-covers/The-Cosmic-Key-1792455593238.jpg`,
  },
  {
    name: "Zen Underwater",
    category: "Soundscape",
    audio: `${CDN}/background-audio/ZEN-Underwater-Music-Theta-8Hz.m4a`,
    art: `${CDN}/composition-covers/ZEN-Underwater-Music-Theta-8Hz-1792455727971.jpg`,
  },
] as const;

/** Speechify voices from the sounds library, with their portraits and preview samples. */
export const VOICES = [
  {
    name: "Arun",
    descriptor: "Low pitch · UK accent",
    portrait: `${CDN}/speaker-portraits/arun.jpg?v=2026-10-09T15%3A15%3A24.697Z`,
    sample: `${CDN}/speaker-samples/arun/loud.m4a`,
  },
  {
    name: "Beatrice",
    descriptor: "High pitch · UK accent",
    portrait: `${CDN}/speaker-portraits/beatrice_32.jpg?v=2026-10-09T15%3A02%3A09.764Z`,
    sample: `${CDN}/speaker-samples/beatrice_32/loud.m4a`,
  },
  {
    name: "Benjamin",
    descriptor: "Mid pitch · UK accent",
    portrait: `${CDN}/speaker-portraits/benjamin.jpg?v=2026-10-09T15%3A14%3A13.466Z`,
    sample: `${CDN}/speaker-samples/benjamin/loud.m4a`,
  },
  {
    name: "Elijah",
    descriptor: "Low pitch · African accent",
    portrait: `${CDN}/speaker-portraits/elijah.jpg?v=2026-10-09T15%3A28%3A58.762Z`,
    sample: `${CDN}/speaker-samples/elijah/loud.m4a`,
  },
  {
    name: "Imogen",
    descriptor: "Mid pitch · UK accent",
    portrait: `${CDN}/speaker-portraits/imogen_32.jpg?v=2026-10-09T15%3A02%3A52.268Z`,
    sample: `${CDN}/speaker-samples/imogen_32/loud.m4a`,
  },
  {
    name: "Janelle",
    descriptor: "High pitch · US accent",
    portrait: `${CDN}/speaker-portraits/janelle.jpg?v=2026-10-09T15%3A44%3A21.937Z`,
    sample: `${CDN}/speaker-samples/janelle/loud.m4a`,
  },
  {
    name: "Keenan",
    descriptor: "Low pitch · US accent",
    portrait: `${CDN}/speaker-portraits/ken.jpg?v=2026-10-09T15%3A10%3A31.147Z`,
    sample: `${CDN}/speaker-samples/ken/loud.m4a`,
  },
  {
    name: "Oliver",
    descriptor: "Low pitch · US accent",
    portrait: `${CDN}/speaker-portraits/oliver.jpg?v=2026-10-20T01%3A07%3A51.076Z`,
    sample: `${CDN}/speaker-samples/oliver/loud.m4a`,
  },
  {
    name: "Phil",
    descriptor: "Low pitch · US accent",
    portrait: `${CDN}/speaker-portraits/phil.jpg?v=2026-10-09T15%3A05%3A49.375Z`,
    sample: `${CDN}/speaker-samples/phil/loud.m4a`,
  },
] as const;

/** Vision board from alexmaragakis@hotmail.co.uk, in board order. */
export const VISION_SCENES = [
  {
    caption: "Me performing an acoustic guitar solo on stage",
    photo:
      "https://d30tgo2eshgnaf.cloudfront.net/ideate/vision/bf93d0e7-a478-4d57-8f6c-2f874f90ea81/1277cf3b-9a36-4ac4-8aa0-fbe10fe052aa.jpg",
    illustrated:
      "https://d3k8rq6eqba40d.cloudfront.net/ideate/vision/bf93d0e7-a478-4d57-8f6c-2f874f90ea81/a52dfea4-a47e-47d7-8a3d-0e955786da81.jpg",
  },
  {
    caption: "Me seated on a large pile of scattered cash",
    photo:
      "https://d30tgo2eshgnaf.cloudfront.net/ideate/vision/bf93d0e7-a478-4d57-8f6c-2f874f90ea81/3b060cfe-be12-4cfa-bf37-34944d934810.jpg",
    illustrated:
      "https://d3k8rq6eqba40d.cloudfront.net/ideate/vision/bf93d0e7-a478-4d57-8f6c-2f874f90ea81/d52b764e-3e1d-49a8-b3e8-7898d8db91b6.jpg",
  },
  {
    caption: "Me working at a minimalist desk in golden-hour light",
    photo:
      "https://d30tgo2eshgnaf.cloudfront.net/ideate/vision/bf93d0e7-a478-4d57-8f6c-2f874f90ea81/e12997c4-d8b6-4cc0-bbff-f98f43fe25ec.jpg",
    illustrated:
      "https://d3k8rq6eqba40d.cloudfront.net/ideate/vision/bf93d0e7-a478-4d57-8f6c-2f874f90ea81/a23951ef-a7fc-4c30-8d90-c436e92c8f87.jpg",
  },
  {
    caption: "Me standing on a sun-kissed sandy beach at golden hour",
    photo:
      "https://d30tgo2eshgnaf.cloudfront.net/ideate/vision/bf93d0e7-a478-4d57-8f6c-2f874f90ea81/94fe7cc9-8682-494d-93f7-9b352a2cd436.jpg",
    illustrated:
      "https://d3k8rq6eqba40d.cloudfront.net/ideate/vision/bf93d0e7-a478-4d57-8f6c-2f874f90ea81/193a7718-754e-45c6-8c86-85cd80b057b6.jpg",
  },
  {
    caption: "Me bench pressing with controlled form in a bright, modern gym",
    photo:
      "https://d30tgo2eshgnaf.cloudfront.net/ideate/vision/bf93d0e7-a478-4d57-8f6c-2f874f90ea81/388352e0-dbc0-4aec-ac6e-5d5898cfa7b9.jpg",
    illustrated:
      "https://d3k8rq6eqba40d.cloudfront.net/ideate/vision/bf93d0e7-a478-4d57-8f6c-2f874f90ea81/38304072-ea83-4862-bd83-9eef14c775a9.jpg",
  },
  {
    caption: "Me climbing a snow-covered mountain slope in bright daylight",
    photo:
      "https://d30tgo2eshgnaf.cloudfront.net/ideate/vision/bf93d0e7-a478-4d57-8f6c-2f874f90ea81/f67d596c-2d0e-4ef4-afc2-354f3b9e82b4.jpg",
    illustrated:
      "https://d3k8rq6eqba40d.cloudfront.net/ideate/vision/bf93d0e7-a478-4d57-8f6c-2f874f90ea81/e1fb37f3-4457-4e10-b142-87ac6beb4a36.jpg",
  },
  {
    caption: "Me meditating cross-legged atop a snow-covered Himalayan peak",
    photo:
      "https://d30tgo2eshgnaf.cloudfront.net/ideate/vision/bf93d0e7-a478-4d57-8f6c-2f874f90ea81/334952d8-50c5-47b2-a729-f1cdb1fad93b.jpg",
    illustrated:
      "https://d3k8rq6eqba40d.cloudfront.net/ideate/vision/bf93d0e7-a478-4d57-8f6c-2f874f90ea81/0ca3a065-5386-46f0-87d1-8f17ffa8b42b.jpg",
  },
] as const;

export const VISION_LINES = VISION_SCENES.map((scene) => scene.caption);
export const VISION_PHOTO = VISION_SCENES.map((scene) => scene.photo);
export const VISION_ILLUSTRATED = VISION_SCENES.map((scene) => scene.illustrated);

export const HEAL_ART = styleImage("heal-1792449332972");
export const FOCUS_ART = VISION_SCENES[2].illustrated;

export const CEILING = {
  ambitious: [
    "a busy studio in town",
    "sells paintings every week",
    "People come back for more.",
  ],
  audacious: [
    "a gallery in London",
    "sells out every collection",
    "Collectors wait for his next piece.",
  ],
  // delusional: [
  //   "galleries in London, Paris and New York",
  //   "becomes the most collected painter alive",
  //   "Museums ask first.",
  // ],
} as const;

export type CeilingLevel = keyof typeof CEILING;
export type VisionKind = "photo" | "illustrated";
