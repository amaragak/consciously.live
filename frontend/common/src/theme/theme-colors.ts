/**
 * Theme source of truth.
 *
 * `PRIMARY` is the brand fill (gold-peach). Neutrals (paper, navy ink, borders)
 * are independent so the page stays cream and the light header matches the app canvas.
 */

import {
  AUTH_HERO_PATTERN_DARK,
  AUTH_HERO_PATTERN_LIGHT,
  HOME_HERO_PATTERN_DARK,
  HOME_HERO_PATTERN_LIGHT,
} from "./color-scheme";

/** Brand fill — gold-peach (sun / logo). Light UI accent uses tab gold; CTAs use `MIST`. */
export const PRIMARY = "#F0A865";

/**
 * Eyebrow / selected-nav / insight section labels on cream.
 * Slightly darker than tab gold (`#C8A46A` mixed toward ink) — was terracotta.
 */
export const ACCENT_LINK = "#A68B5E";

/** Dark warm brown on gold-peach fills. */
export const ON_ACCENT = "#3D2E10";

/**
 * @deprecated Placeholders for `--accent-gradient-button`. Light mode uses a
 * horizontal mist → mist-end gradient; dark stays a flat copper fill.
 */
export const ACCENT_BUTTON_GRADIENT =
  "linear-gradient(90deg, {accent} 0%, {end} 100%)";
export const ACCENT_BUTTON_GRADIENT_BLEND = 1;

/**
 * Header wordmark fill. Radial origin sits on the sun (left of the text).
 * White near the sun → light gold-peach by the end of “consciously”.
 * Ellipse is sized to the glyph box so the shift reads across the word.
 * Placeholders: {white} {soft} {end}. Becomes `--brand-wordmark-gradient`.
 * SOFT/END = accent mixed into white (0 = white, 1 = solid gold-peach).
 */
export const BRAND_WORDMARK_GRADIENT =
  "radial-gradient(ellipse 155% 200% at -1.75rem 50%, {white} 0%, {white} 28%, {soft} 55%, {end} 100%)";
export const BRAND_WORDMARK_SOFT = 0.16;
export const BRAND_WORDMARK_END = 0.28;

const WHITE = "#ffffff";
const BLACK = "#000000";

/** Independent of brand hue. */
export const DANGER = "#dc2626";
export const SUCCESS = "#059669";
export const INFO = "#0284c7";

const NAV = "#33465C";
// const NAV = "#6E88A3";
/** SPA header fill — shared by light + dark (Midnight Navy). */
const NAV_HEADER = "#0F1B2D";
/** Light app canvas. Hybrid header fill stays cream; SPA light/dark header is navy. */
const APP_CANVAS_LIGHT = "#FAF6F0";
const NAV_LIGHT = APP_CANVAS_LIGHT;
const NAV_FOREGROUND = WHITE;
const NAV_MUTED = "rgb(255 255 255 / 0.68)";
/** Fallback trail crumb token on navy (dark); light/hybrid prefer accent-link CSS. */
const NAV_CRUMB = "rgb(255 255 255 / 0.88)";
const NAV_ACTIVE = "rgb(255 255 255 / 0.14)";
const NAV_FOREGROUND_LIGHT = "#1E2530";
const NAV_MUTED_LIGHT = "#5A5648";
/** Trail crumb token on cream header (hybrid / light). */
const NAV_CRUMB_LIGHT = "#3D3A32";

/** Light-mode segmented tab active fill + selected-row accent (journal / chat). */
const TAB_SELECTED_LIGHT = "#C8A46A";
/** Rated / filled library stars. */
export const STAR_FILLED = "#D4B080";
/** Unrated star glyphs — filled gold at 30% opacity. */
export const STAR_IDLE = "rgb(212 176 128 / 0.3)";
/** Dark-mode empty stars (slightly higher contrast on navy). */
export const STAR_IDLE_DARK = "#B5AF9F";

const GOLD_LIGHT = "#F0A865";

/**
 * Paper / ink / chrome. Independent of PRIMARY.
 */
const PAPER_LIGHT = {
  background: APP_CANVAS_LIGHT,
  foreground: "#1E2530",
  muted: "#7A7566",
  faint: "#A39C8C",
  card: "#FFFFFF",
  border: "#EADFCF",
  borderSubtle: "#F0E7DA",
  deep: "#1E2530",
  surface: WHITE,
} as const;

/** Independent clone of light — edit these hexes without changing `PAPER_LIGHT`. */
const PAPER_HYBRID = {
  background: "#f8f4ee",
  foreground: "#1E2530",
  muted: "#7A7566",
  faint: "#A39C8C",
  card: "#FFFFFF",
  border: "#E5E0D2",
  borderSubtle: "#EEE9DB",
  deep: "#1E2530",
  surface: WHITE,
} as const;

/** Homepage v2 paper — ivory / navy / gold (see docs/design/homepage-v2). */
const PAPER_V2 = {
  background: "#F6F1E7",
  foreground: "#0F1B2D",
  muted: "#6B6457",
  faint: "#8A6A34",
  card: "#FFFFFF",
  border: "#E6DDCB",
  borderSubtle: "#EFE7D6",
  deep: "#0F1B2D",
  surface: WHITE,
} as const;

const PAPER_DARK = {
  background: "#1E2530",
  foreground: "#FAF8F3",
  muted: "#A39C8C",
  faint: "#8A8478",
  card: "#2A3544",
  border: "#3D4A5C",
  borderSubtle: "#33465C",
  deep: "#0F141A",
  surface: "#2A3544",
} as const;

/**
 * Secondary raised surface (main app sidebar, questions grid cells) — warmer/deeper than
 * canvas in light; slate panel in dark. Independent of `--card` / card-warm.
 */
const SURFACE_2_LIGHT = "#EEE8DC";
const SURFACE_2_DARK = "#243041";
/** List rails (journal / chat) — secondary sidebar between main rail and content. */
const SURFACE_RAIL_LIGHT = "#F6F2EA";
/** Right edge of main + secondary sidebars (light). */
const SIDEBAR_BORDER_LIGHT = "#E0D6C4";
/** Cool panel for hybrid sidebar (`bg-surface-2`). */
const SURFACE_2_HYBRID = "#ecf0ec";
/** Slightly deeper hybrid edge — card hover / selected ring. */
const SURFACE_2_HYBRID_EDGE = mixHex(SURFACE_2_HYBRID, "#1E2530", 0.16);

/**
 * Light-mode cream mixes shared by journal + create “warm card” tokens so both
 * start identical; change either assemble() field alone to diverge later.
 */
const WARM_CREAM_BG_MIX = 0.94;
const WARM_CREAM_BORDER_MIX = 0.72;

type Rgb = { r: number; g: number; b: number };
type Hsl = { h: number; s: number; l: number };

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

const CSS_NAMED: Record<string, string> = {
  red: "#ff0000",
  orange: "#ffa500",
  gold: "#ffd700",
  green: "#008000",
  teal: "#008080",
  blue: "#0000ff",
  purple: "#800080",
  black: BLACK,
  white: WHITE,
};

/** Accept `#hex` or a small set of CSS color names (for trying a new PRIMARY). */
export function resolveColor(input: string): string {
  const t = input.trim();
  if (t.startsWith("#")) return t;
  return CSS_NAMED[t.toLowerCase()] ?? t;
}

export function hexToRgb(hex: string): Rgb {
  const t = resolveColor(hex).replace(/^#/, "");
  const full = t.length === 3 ? t.split("").map((c) => `${c}${c}`).join("") : t;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return { r: 0, g: 0, b: 0 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) =>
    Math.round(Math.min(255, Math.max(0, n)))
      .toString(16)
      .padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function hexToHsl(hex: string): Hsl {
  let { r, g, b } = hexToRgb(hex);
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

export function hslToHex(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360;
  const ss = clamp01(s);
  const ll = clamp01(l);
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const hp = hh / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) {
    r = c;
    g = x;
  } else if (hp < 2) {
    r = x;
    g = c;
  } else if (hp < 3) {
    g = c;
    b = x;
  } else if (hp < 4) {
    g = x;
    b = c;
  } else if (hp < 5) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const m = ll - c / 2;
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

export function rel(hex: string, dh: number, ds: number, dl: number): string {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h + dh, s + ds, l + dl);
}

/** Cool mist — light-mode primary CTA fill (`accent-button` / accent-fill-gradient). */
export const MIST = "#C3D2E8";
/** Lighter mist stop — right edge of light-mode primary button gradient. */
export const MIST_END = "#D6E1EF";

/** Light-mode filled CTAs. Dark mode uses `DARK_PRIMARY` instead. */
export const ACCENT_BUTTON_FILL = MIST;

/**
 * Navy-header sun / italic section verb / current crumb (SPA), and marketing
 * hybrid hero gold accents. Same hex as dark copper primary.
 */
export const HEADER_GOLD = "#D9B87C";
export const HEADER_GOLD_RGB = "217 184 124";

/**
 * Dark-mode brand / primary fill (links, buttons, accents on navy).
 * Softer gold than light PRIMARY peach so it stays legible on dark surfaces.
 */
export const DARK_PRIMARY = HEADER_GOLD;

export function mixHex(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(
    A.r + (B.r - A.r) * t,
    A.g + (B.g - A.g) * t,
    A.b + (B.b - A.b) * t,
  );
}

export function rgbChannels(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `${r} ${g} ${b}`;
}

export function rgba(hex: string, alpha: number): string {
  return `rgb(${rgbChannels(hex)} / ${alpha})`;
}

/**
 * Soft radial lightening of the header around the sun — same hue,
 * barely lifted toward white (subtle; no gold/peach).
 */
function headerSunGlowFromNav(navHex: string): string {
  const core = mixHex(navHex, WHITE, 0.14);
  const mid = mixHex(navHex, WHITE, 0.06);
  return `radial-gradient(circle, ${rgba(core, 0.55)} 0%, ${rgba(mid, 0.28)} 40%, ${rgba(core, 0)} 70%)`;
}

/** SPA dark / Next sticky header navy. */
export const SPA_NAVY = NAV_HEADER;

/** White or near-black depending on background lightness. */
export function onColor(bgHex: string): string {
  return hexToHsl(bgHex).l > 0.55 ? rel(bgHex, 0, 0.05, -0.72) : WHITE;
}

type Semantic = {
  background: string;
  foreground: string;
  muted: string;
  faint: string;
  card: string;
  border: string;
  borderSubtle: string;
  accent: string;
  /** Filled CTAs — mist in light; breadcrumb copper in dark. */
  accentButton: string;
  accentSoft: string;
  accentLink: string;
  gold: string;
  deep: string;
  surface: string;
  /** Secondary raised surface — see SURFACE_2_* (not `--card`). */
  surface2: string;
  /** Stronger edge of surface-2 (hybrid card rings / focus). */
  surface2Edge: string;
  /** List rails — midpoint of main sidebar (`surface2`) and header/canvas. */
  surfaceRail: string;
  /** Right border on main + secondary sidebars. */
  sidebarBorder: string;
  onAccent: string;
  overlay: string;
  nav: string;
  navForeground: string;
  navMuted: string;
  /** Clickable non-current header trail crumbs (brighter than muted on navy). */
  navCrumb: string;
  navActive: string;
  /** SPA navy-header sun / verb / current crumb (+ marketing hybrid gold accents). */
  headerGold: string;
  /** Selected / active segment fills — gold-peach in light, navy in dark. */
  selected: string;
  onSelected: string;
  starIdle: string;
  starFilled: string;
  danger: string;
  dangerSoft: string;
  success: string;
  info: string;
  gradientLight: string;
  gradientMid: string;
  gradientDeep: string;
  /** Marketing / hero surfaces (role tokens — one value per theme). */
  homeHeroBg: string;
  homeHeroPattern: string;
  homeHeroPatternOpacity: string;
  marketingInk: string;
  marketingMuted: string;
  marketingBandA: string;
  marketingBandB: string;
  marketingBandC: string;
  marketingBandD: string;
  /** Ideate band on meditate page (distinct light tan). */
  marketingBandIdeate: string;
  marketingBody: string;
  marketingCardBg: string;
  marketingCardBorder: string;
  marketingCardHover: string;
  marketingCardShadow: string;
  marketingIconBg: string;
  marketingIconFg: string;
  marketingPanelBg: string;
  marketingEyebrow: string;
  marketingPillarIdleBg: string;
  marketingPillarSelectedBg: string;
  marketingPillarIdleIconFg: string;
  marketingHighlightIconBg: string;
  marketingHighlightIconFg: string;
  marketingNavChrome: string;
  marketingInputShellBg: string;
  marketingPlaceholder: string;
  marketingMenuBg: string;
  marketingMenuBorder: string;
  marketingMenuHover: string;
  marketingMenuMuted: string;
  /**
   * Journal editor shell — warm cream in light; brown-tinted panel in dark.
   * Separate from `--card` (white/slate) and `--card-warm-*` (create flow).
   */
  journalWarmBg: string;
  journalWarmBorder: string;
  journalWarmInputBg: string;
  /**
   * Create-flow / path / mixer warm cards. Light matches journal cream today;
   * dark matches prior `surface-2` override (not journal’s brown panel).
   */
  cardWarmBg: string;
  cardWarmBorder: string;
  cardWarmInputBg: string;
  /** Create audio footer rule — exact prior light rgba; dark = `--border`. */
  createHairlineBorder: string;
  headerBorder: string;
  headerShadow: string;
  /** Cast to the right of the app sidebar. */
  sidebarShadow: string;
  headerGlowSun: string;
  headerGlowRight: string;
  proHeaderCtaBg: string;
  proHeaderCtaFg: string;
  proHeaderCtaImage: string;
  proHeaderCtaShadow: string;
};

/** Brand tints/shades from PRIMARY, mixed onto the given paper (not replacing it). */
function brandFromPrimary(
  rawPrimary: string,
  paper: typeof PAPER_LIGHT | typeof PAPER_DARK | typeof PAPER_HYBRID | typeof PAPER_V2,
  dark: boolean,
): Pick<
  Semantic,
  | "accent"
  | "accentSoft"
  | "onAccent"
  | "gradientLight"
  | "gradientMid"
  | "gradientDeep"
> {
  const p = resolveColor(rawPrimary);
  // Light: tab gold (not peach). Dark: softer copper. Peach stays on the sun via PRIMARY.
  const accent = dark ? DARK_PRIMARY : TAB_SELECTED_LIGHT;
  return {
    accent,
    accentSoft: dark
      ? mixHex(paper.card, accent, 0.16)
      : mixHex(accent, paper.background, 0.857),
    onAccent: ON_ACCENT,
    gradientLight: rel(p, 9.5, 0.156, 0.274),
    gradientMid: rel(p, 2.9, 0.106, 0.1),
    gradientDeep: rel(p, -3.4, 0.065, -0.184),
  };
}

function assemble(
  paper: typeof PAPER_LIGHT | typeof PAPER_DARK | typeof PAPER_HYBRID | typeof PAPER_V2,
  gold: string,
  dark: boolean,
): Semantic {
  const brand = brandFromPrimary(PRIMARY, paper, dark);
  const accentButton = dark ? DARK_PRIMARY : ACCENT_BUTTON_FILL;
  /** Mist is cool/light — navy ink; dark gold CTAs keep warm brown. */
  const onAccent = dark ? ON_ACCENT : NAV_FOREGROUND_LIGHT;
  const warmCreamBg = mixHex(PRIMARY, paper.background, WARM_CREAM_BG_MIX);
  const warmCreamBorder = mixHex(PRIMARY, paper.background, WARM_CREAM_BORDER_MIX);
  const surface2 = dark ? SURFACE_2_DARK : SURFACE_2_LIGHT;
  return {
    ...paper,
    ...brand,
    accentButton,
    onAccent,
    gold,
    surface2,
    surface2Edge: dark
      ? mixHex(SURFACE_2_DARK, WHITE, 0.18)
      : mixHex(SURFACE_2_LIGHT, "#1E2530", 0.14),
    /** Midpoint of sidebar + header/canvas (light uses the designed cream). */
    surfaceRail: dark
      ? mixHex(SURFACE_2_DARK, paper.background, 0.5)
      : SURFACE_RAIL_LIGHT,
    sidebarBorder: dark ? paper.border : SIDEBAR_BORDER_LIGHT,
    overlay: BLACK,
    accentLink: dark ? DARK_PRIMARY : ACCENT_LINK,
    /** SPA light + dark share the same navy header (`#0F1B2D`). */
    nav: NAV_HEADER,
    navForeground: NAV_FOREGROUND,
    navMuted: NAV_MUTED,
    navCrumb: NAV_CRUMB,
    navActive: NAV_ACTIVE,
    headerGold: HEADER_GOLD,
    headerBorder: "rgba(255,255,255,0.1)",
    headerShadow: "0 4px 18px rgb(15 27 45 / 0.28)",
    headerGlowSun: headerSunGlowFromNav(NAV_HEADER),
    headerGlowRight:
      "radial-gradient(circle, rgb(16 26 38 / 0.35) 0%, rgb(24 36 50 / 0.18) 32%, rgb(15 27 45 / 0) 68%)",
    // Light: tab / selected gold. Dark: navy selected.
    selected: dark ? NAV : TAB_SELECTED_LIGHT,
    onSelected: dark ? WHITE : ON_ACCENT,
    starIdle: dark ? STAR_IDLE_DARK : STAR_IDLE,
    starFilled: STAR_FILLED,
    danger: dark ? mixHex(DANGER, WHITE, 0.35) : DANGER,
    dangerSoft: dark ? mixHex(DANGER, BLACK, 0.78) : mixHex(DANGER, WHITE, 0.92),
    success: dark ? mixHex(SUCCESS, WHITE, 0.2) : SUCCESS,
    info: dark ? mixHex(INFO, WHITE, 0.2) : INFO,
    homeHeroBg: dark ? "#1A2330" : paper.background,
    homeHeroPattern: dark
      ? `url(${JSON.stringify(HOME_HERO_PATTERN_DARK)})`
      : `url(${JSON.stringify(HOME_HERO_PATTERN_LIGHT)})`,
    homeHeroPatternOpacity: dark ? "0.18" : "0.32",
    marketingInk: dark ? "#F4F0E8" : "#1E2530",
    marketingMuted: dark ? "#A8B0BC" : "#5A5342",
    marketingBody: dark ? "#A8B0BC" : "#7A7566",
    /** Full-bleed marketing strips — gold-tinted paper (HEADER_GOLD); wide spread. */
    marketingBandA: dark
      ? "#2A3A4E"
      : mixHex(HEADER_GOLD, paper.background, 0.78),
    /** Richest gold band (e.g. Meditate strip). */
    marketingBandB: dark
      ? "#1A2330"
      : mixHex(HEADER_GOLD, paper.background, 0.58),
    /** Mid band (feature strips). */
    marketingBandC: dark
      ? "#243447"
      : mixHex(HEADER_GOLD, paper.background, 0.68),
    /** Soft cream band (journal, listen samples). */
    marketingBandD: dark
      ? "#161D28"
      : mixHex(HEADER_GOLD, paper.background, 0.88),
    /** Near-page band (e.g. Manifest) — clear contrast vs richest gold. */
    marketingBandIdeate: dark
      ? "#1A2330"
      : mixHex(HEADER_GOLD, paper.background, 0.98),
    marketingCardBg: dark ? "#2A3544" : "#FFFFFF",
    marketingCardBorder: dark ? "rgba(255,255,255,0.1)" : "#E5DFD0",
    marketingCardHover: dark ? "#323E4F" : "#FBF8F2",
    marketingCardShadow: dark
      ? "none"
      : "0 10px 28px rgb(30 37 48 / 0.06)",
    marketingIconBg: dark
      ? "rgba(255,255,255,0.1)"
      : ACCENT_BUTTON_FILL,
    marketingIconFg: dark ? GOLD_LIGHT : "#33465C",
    marketingPanelBg: dark ? "#12181F" : "#FFFFFF",
    marketingEyebrow: dark ? GOLD_LIGHT : ACCENT_LINK,
    marketingPillarIdleBg: dark ? "#243041" : "#FFFFFF",
    marketingPillarSelectedBg: dark ? "#2F2C24" : "#FFFFFF",
    marketingPillarIdleIconFg: dark ? "#F4F0E8" : "#33465C",
    marketingHighlightIconBg: dark
      ? "rgba(240,168,85,0.22)"
      : ACCENT_BUTTON_FILL,
    marketingHighlightIconFg: dark ? GOLD_LIGHT : ACCENT_LINK,
    marketingNavChrome: dark ? "rgba(255,255,255,0.2)" : "#D8D0BC",
    marketingInputShellBg: dark ? "rgba(255,255,255,0.06)" : "#FFFFFF",
    marketingPlaceholder: dark ? "rgba(255,255,255,0.3)" : "#C8C0B2",
    marketingMenuBg: dark ? "#1E2530" : "#FFFFFF",
    marketingMenuBorder: dark ? "rgba(255,255,255,0.15)" : "#D8D2C4",
    marketingMenuHover: dark ? "rgba(255,255,255,0.1)" : "#F4F0E8",
    marketingMenuMuted: dark ? "#C8C0B2" : "#5A5548",
    journalWarmBg: dark ? "#2A261F" : "#FFFDF9",
    journalWarmBorder: dark ? "#5A4F3A" : warmCreamBorder,
    journalWarmInputBg: dark ? "#1C1914" : "#FFFFFF",
    // Create warm cards: light = cream; dark = former dark:bg-surface-2 / border.
    cardWarmBg: dark ? SURFACE_2_DARK : warmCreamBg,
    cardWarmBorder: dark ? paper.border : warmCreamBorder,
    cardWarmInputBg: dark ? rgba(paper.background, 0.4) : "#FFFFFF",
    createHairlineBorder: dark ? paper.border : "rgba(180, 140, 80, 0.2)",
    sidebarShadow: dark
      ? "4px 0 18px rgb(20 28 38 / 0.28)"
      : "4px 0 18px rgb(80 60 30 / 0.06)",
    proHeaderCtaBg: accentButton,
    proHeaderCtaFg: onAccent,
    proHeaderCtaImage: "none",
    proHeaderCtaShadow: "none",
  };
}

/** Filled CTA / `--gold` token — light tab gold; dark breadcrumb copper. */
export const light = assemble(PAPER_LIGHT, TAB_SELECTED_LIGHT, false);
export const dark = assemble(PAPER_DARK, DARK_PRIMARY, true);
/** Light recipe + navy duotone hero/footer field (Next marketing). */
export const hybrid = {
  ...assemble(PAPER_HYBRID, TAB_SELECTED_LIGHT, false),
  /** Header stays on cream canvas; only `--background` uses hybrid paper. */
  nav: NAV_LIGHT,
  navForeground: NAV_FOREGROUND_LIGHT,
  navMuted: NAV_MUTED_LIGHT,
  navCrumb: NAV_CRUMB_LIGHT,
  navActive: mixHex(ACCENT_BUTTON_FILL, NAV_LIGHT, 0.84),
  headerGold: HEADER_GOLD,
  headerBorder: "#E5E0D2",
  headerShadow: "0 4px 18px rgb(80 60 30 / 0.06)",
  /** Soft brightening of cream header around the sun (same hue, no gold). */
  headerGlowSun: headerSunGlowFromNav(NAV_LIGHT),
  headerGlowRight:
    "radial-gradient(circle, rgb(250 246 240 / 0.5) 0%, rgb(250 246 240 / 0) 70%)",
  surface2: SURFACE_2_HYBRID,
  surface2Edge: SURFACE_2_HYBRID_EDGE,
  surfaceRail: mixHex(SURFACE_2_HYBRID, PAPER_HYBRID.background, 0.5),
  sidebarBorder: PAPER_HYBRID.border,
  homeHeroBg: "#1A1820",
  homeHeroPattern: `url(${JSON.stringify(AUTH_HERO_PATTERN_DARK)})`,
  homeHeroPatternOpacity: "0.88",
};

/**
 * Homepage v2 theme — navy / ivory / gold.
 * Light & dark homepage variants are intentionally undefined for now.
 */
export const v2 = {
  ...assemble(PAPER_V2, "#C8A46A", false),
  nav: "#0F1B2D",
  homeHeroBg: "#0F1B2D",
  homeHeroPattern: "none",
  homeHeroPatternOpacity: "0",
};

export function accentGradientCss(s: Semantic): string {
  // Flat brand fill (legacy name kept for `--accent-gradient` consumers).
  return s.accent;
}

/** Fills `ACCENT_BUTTON_GRADIENT` from the active theme. */
export function accentGradientButtonCss(s: Semantic, dark: boolean): string {
  const end = dark ? s.accentButton : MIST_END;
  return ACCENT_BUTTON_GRADIENT.replaceAll("{accent}", s.accentButton)
    .replaceAll("{end}", end)
    .replaceAll("{light}", s.accentButton)
    .replaceAll("{mid}", s.accentButton)
    .replaceAll("{deep}", s.accentButton);
}

/** Fills `BRAND_WORDMARK_GRADIENT` from the active theme (resolved hex stops). */
export function brandWordmarkGradientCss(s: Semantic, _dark: boolean): string {
  /* Cream / light headers get ink; navy headers get the sun-lit white→gold mark. */
  if (hexToHsl(s.nav).l > 0.55) {
    const ink = "#1E2530";
    return `linear-gradient(0deg, ${ink}, ${ink})`;
  }
  return BRAND_WORDMARK_GRADIENT.replaceAll("{white}", WHITE)
    .replaceAll("{soft}", mixHex(WHITE, s.accent, BRAND_WORDMARK_SOFT))
    .replaceAll("{end}", mixHex(WHITE, s.accent, BRAND_WORDMARK_END));
}

/** Muted category / meditation-type card fills — [light mode, dark mode]. */
export const CATEGORY_CARD_FILLS: ReadonlyArray<readonly [string, string]> = [
  ["#e4d6c8", "#2a2420"],
  ["#d7e0d4", "#1f2820"],
  ["#d4dde6", "#1e2630"],
  ["#d5e4e2", "#1d2826"],
  ["#eadcc4", "#2a251c"],
  ["#e6d4d8", "#2a2226"],
  ["#e8e0c9", "#28241c"],
  ["#ddd6e4", "#242030"],
  ["#cfd8e2", "#1c2430"],
  ["#ead3c8", "#2c221e"],
  ["#d4e2d6", "#1e2820"],
  ["#dce0d0", "#24281e"],
  ["#d8d6d2", "#262420"],
];

export function chartSeriesColor(seed: string): string {
  let n = 0;
  for (let i = 0; i < seed.length; i += 1) n = (n * 31 + seed.charCodeAt(i)) >>> 0;
  return hslToHex(n % 360, 0.55, 0.52);
}

function varsFor(s: Semantic, dark: boolean): Record<string, string> {
  return {
    /** App canvas. Light keeps paper === nav; hybrid can diverge (header stays `--nav`). */
    "--background": s.background,
    "--foreground": s.foreground,
    "--muted": s.muted,
    "--faint": s.faint,
    "--card": s.card,
    "--border": s.border,
    "--border-subtle": s.borderSubtle,
    "--accent": s.accent,
    "--accent-button": s.accentButton,
    "--accent-soft": s.accentSoft,
    "--accent-link": s.accentLink,
    "--gold": s.gold,
    "--deep": s.deep,
    "--surface": s.surface,
    "--surface-2": s.surface2,
    "--surface-2-edge": s.surface2Edge,
    "--surface-rail": s.surfaceRail,
    "--sidebar-border": s.sidebarBorder,
    "--on-accent": s.onAccent,
    "--overlay": s.overlay,
    "--nav": s.nav,
    "--nav-foreground": s.navForeground,
    "--nav-muted": s.navMuted,
    "--nav-crumb": s.navCrumb,
    "--nav-active": s.navActive,
    "--header-gold": s.headerGold,
    "--selected": s.selected,
    "--on-selected": s.onSelected,
    "--star-idle": s.starIdle,
    "--star-filled": s.starFilled,
    "--danger": s.danger,
    "--danger-soft": s.dangerSoft,
    "--success": s.success,
    "--info": s.info,
    "--accent-gradient": accentGradientCss(s),
    "--accent-gradient-button": accentGradientButtonCss(s, dark),
    "--brand-wordmark-gradient": brandWordmarkGradientCss(s, dark),
    "--accent-rgb": rgbChannels(s.accent),
    "--foreground-rgb": rgbChannels(s.foreground),
    "--deep-rgb": rgbChannels(s.deep),
    "--home-hero-bg": s.homeHeroBg,
    "--home-hero-pattern": s.homeHeroPattern,
    "--home-hero-pattern-opacity": s.homeHeroPatternOpacity,
    "--marketing-ink": s.marketingInk,
    "--marketing-muted": s.marketingMuted,
    "--marketing-band-a": s.marketingBandA,
    "--marketing-band-b": s.marketingBandB,
    "--marketing-band-c": s.marketingBandC,
    "--marketing-band-d": s.marketingBandD,
    "--marketing-band-ideate": s.marketingBandIdeate,
    "--marketing-body": s.marketingBody,
    "--marketing-card-bg": s.marketingCardBg,
    "--marketing-card-border": s.marketingCardBorder,
    "--marketing-card-hover": s.marketingCardHover,
    "--marketing-card-shadow": s.marketingCardShadow,
    "--marketing-icon-bg": s.marketingIconBg,
    "--marketing-icon-fg": s.marketingIconFg,
    "--marketing-panel-bg": s.marketingPanelBg,
    "--marketing-eyebrow": s.marketingEyebrow,
    "--marketing-pillar-idle-bg": s.marketingPillarIdleBg,
    "--marketing-pillar-selected-bg": s.marketingPillarSelectedBg,
    "--marketing-pillar-idle-icon-fg": s.marketingPillarIdleIconFg,
    "--marketing-highlight-icon-bg": s.marketingHighlightIconBg,
    "--marketing-highlight-icon-fg": s.marketingHighlightIconFg,
    "--marketing-nav-chrome": s.marketingNavChrome,
    "--marketing-input-shell-bg": s.marketingInputShellBg,
    "--marketing-placeholder": s.marketingPlaceholder,
    "--marketing-menu-bg": s.marketingMenuBg,
    "--marketing-menu-border": s.marketingMenuBorder,
    "--marketing-menu-hover": s.marketingMenuHover,
    "--marketing-menu-muted": s.marketingMenuMuted,
    "--journal-warm-bg": s.journalWarmBg,
    "--journal-warm-border": s.journalWarmBorder,
    "--journal-warm-input-bg": s.journalWarmInputBg,
    "--card-warm-bg": s.cardWarmBg,
    "--card-warm-border": s.cardWarmBorder,
    "--card-warm-input-bg": s.cardWarmInputBg,
    "--create-hairline-border": s.createHairlineBorder,
    "--header-border": s.headerBorder,
    "--header-shadow": s.headerShadow,
    "--sidebar-shadow": s.sidebarShadow,
    "--header-glow-sun": s.headerGlowSun,
    "--header-glow-right": s.headerGlowRight,
    "--pro-header-cta-bg": s.proHeaderCtaBg,
    "--pro-header-cta-fg": s.proHeaderCtaFg,
    "--pro-header-cta-image": s.proHeaderCtaImage,
    "--pro-header-cta-shadow": s.proHeaderCtaShadow,
  };
}

function cssBlock(selector: string, vars: Record<string, string>, indent = ""): string {
  const pad = `${indent}  `;
  const body = Object.entries(vars)
    .map(([k, v]) => `${pad}${k}: ${v};`)
    .join("\n");
  return `${indent}${selector} {\n${body}\n${indent}}`;
}

/** Injected in root layout. The only place brand hexes become CSS variables. */
export const themeRootCss = [
  cssBlock(":root", varsFor(light, false)),
  /** Class-driven dark theme (header dropdown). Default is light. */
  cssBlock(":root.dark", varsFor(dark, true)),
  /** Hybrid is the light recipe on its own paper — change `PAPER_HYBRID` to restyle it. */
  cssBlock(":root.hybrid", varsFor(hybrid, false)),
  /** Homepage v2 — navy / ivory / gold. */
  cssBlock(":root.v2", varsFor(v2, false)),
].join("\n\n");

/**
 * Critical hero paisley URLs — inlined in `<head>` so fetch starts before the
 * globals.css bundle; keep paths in sync with color-scheme.ts constants.
 */
export const homeHeroPatternCriticalCss = [
  `.home-hero::before{background-image:url("${HOME_HERO_PATTERN_LIGHT}")}`,
  `:root.dark .home-hero::before{background-image:url("${HOME_HERO_PATTERN_DARK}")}`,
  `:root.hybrid .home-hero::before{background-image:url("${AUTH_HERO_PATTERN_DARK}");background-size:640px 640px;-webkit-mask-image:none;mask-image:none}`,
  `.home-hero.home-hero--auth::before{background-image:url("${AUTH_HERO_PATTERN_LIGHT}");background-size:480px 480px}`,
  `:root.dark .home-hero.home-hero--auth::before{background-image:url("${AUTH_HERO_PATTERN_DARK}");background-size:480px 480px}`,
  `:root.hybrid .home-hero.home-hero--auth::before{background-image:url("${AUTH_HERO_PATTERN_DARK}");background-size:640px 640px}`,
  `.page-pattern-tile{background-image:url("${HOME_HERO_PATTERN_LIGHT}")}`,
  `:root.dark .page-pattern-tile{background-image:url("${HOME_HERO_PATTERN_DARK}")}`,
  `.journal-editor-pattern-gutter::before{background-image:url("${HOME_HERO_PATTERN_LIGHT}")}`,
  `:root.dark .journal-editor-pattern-gutter::before{background-image:url("${HOME_HERO_PATTERN_DARK}")}`,
].join("\n");
