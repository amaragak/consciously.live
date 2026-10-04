export const CREATE_MEDITATE_ROOT = "/meditate/create";

export type CreateMeditationPath =
  | "pending"
  | "style"
  | "freeflow"
  | "journalReflect"
  | "goal"
  | "oneShot"
  | "fromProgram";

export type FromProgramStep = "pick" | "sessions" | "chat";

export type ParsedCreateMeditationRoute = {
  path: CreateMeditationPath;
  styleStep: "type" | "questions";
  /** Only meaningful when `path === "fromProgram"`. */
  fromProgramStep: FromProgramStep;
  mix: boolean;
  valid: boolean;
};

function partsAfterCreateRoot(pathname: string): string[] | null {
  if (pathname === CREATE_MEDITATE_ROOT) return [];
  const prefix = `${CREATE_MEDITATE_ROOT}/`;
  if (!pathname.startsWith(prefix)) return null;
  return pathname.slice(prefix.length).split("/").filter(Boolean);
}

export function parseCreateMeditationPathname(
  pathname: string,
): ParsedCreateMeditationRoute {
  const parts = partsAfterCreateRoot(pathname);
  if (parts == null) {
    return {
      path: "pending",
      styleStep: "type",
      fromProgramStep: "pick",
      mix: false,
      valid: true,
    };
  }
  if (parts.length === 0) {
    return {
      path: "pending",
      styleStep: "type",
      fromProgramStep: "pick",
      mix: false,
      valid: true,
    };
  }

  const mix = parts[parts.length - 1] === "mix";
  const segs = mix ? parts.slice(0, -1) : parts;
  if (mix && segs.length === 0) {
    return {
      path: "pending",
      styleStep: "type",
      fromProgramStep: "pick",
      mix: false,
      valid: false,
    };
  }

  const a = segs[0];
  const b = segs[1];
  if (a === "by-type" && segs.length === 1) {
    return {
      path: "style",
      styleStep: "type",
      fromProgramStep: "pick",
      mix,
      valid: true,
    };
  }
  if (a === "by-type" && b === "questions" && segs.length === 2) {
    return {
      path: "style",
      styleStep: "questions",
      fromProgramStep: "pick",
      mix,
      valid: true,
    };
  }
  if (a === "from-chat" && segs.length === 1) {
    return {
      path: "freeflow",
      styleStep: "type",
      fromProgramStep: "pick",
      mix,
      valid: true,
    };
  }
  if (a === "from-journal" && segs.length === 1) {
    return {
      path: "journalReflect",
      styleStep: "type",
      fromProgramStep: "pick",
      mix,
      valid: true,
    };
  }
  if (a === "from-idea" && segs.length === 1) {
    return {
      path: "goal",
      styleStep: "type",
      fromProgramStep: "pick",
      mix,
      valid: true,
    };
  }
  if (a === "from-prompt" && segs.length === 1) {
    return {
      path: "oneShot",
      styleStep: "type",
      fromProgramStep: "pick",
      mix,
      valid: true,
    };
  }
  if (a === "from-program" && segs.length === 1) {
    return {
      path: "fromProgram",
      styleStep: "type",
      fromProgramStep: "pick",
      mix,
      valid: true,
    };
  }
  if (a === "from-program" && b === "sessions" && segs.length === 2) {
    return {
      path: "fromProgram",
      styleStep: "type",
      fromProgramStep: "sessions",
      mix,
      valid: true,
    };
  }
  if (a === "from-program" && b === "chat" && segs.length === 2) {
    return {
      path: "fromProgram",
      styleStep: "type",
      fromProgramStep: "chat",
      mix,
      valid: true,
    };
  }
  return {
    path: "pending",
    styleStep: "type",
    fromProgramStep: "pick",
    mix: false,
    valid: false,
  };
}

/**
 * Destinations for the one Create flow (Start → Shape → Sound).
 * Legacy `/by-type` etc. paths still redirect in CreateOneFlow.
 */
export function createMeditationHref(opts: {
  path: CreateMeditationPath;
  styleStep?: "type" | "questions";
  fromProgramStep?: FromProgramStep;
  mix?: boolean;
}): string {
  if (opts.path === "pending") return CREATE_MEDITATE_ROOT;
  if (opts.mix) return `${CREATE_MEDITATE_ROOT}?step=sound`;
  if (opts.path === "freeflow") {
    return `${CREATE_MEDITATE_ROOT}?step=shape&seed=chat`;
  }
  if (opts.path === "style") {
    if (opts.styleStep === "questions") {
      return `${CREATE_MEDITATE_ROOT}?step=shape&seed=style`;
    }
    return `${CREATE_MEDITATE_ROOT}?seed=style`;
  }
  if (opts.path === "journalReflect") {
    return `${CREATE_MEDITATE_ROOT}?fromJournal=1&seed=journal`;
  }
  if (opts.path === "goal") {
    return `${CREATE_MEDITATE_ROOT}?fromDream=1&seed=goal`;
  }
  if (opts.path === "fromProgram") {
    const step = opts.fromProgramStep ?? "pick";
    if (step === "chat" || step === "sessions") {
      return `${CREATE_MEDITATE_ROOT}?step=shape&seed=program`;
    }
    return `${CREATE_MEDITATE_ROOT}?seed=program`;
  }
  // oneShot / prompt
  return CREATE_MEDITATE_ROOT;
}

export function createRouteNeedsPriorState(
  parsed: ParsedCreateMeditationRoute,
): boolean {
  if (!parsed.valid) return false;
  if (parsed.mix) return true;
  if (
    parsed.path === "fromProgram" &&
    (parsed.fromProgramStep === "chat" ||
      parsed.fromProgramStep === "sessions")
  ) {
    return true;
  }
  return parsed.path === "style" && parsed.styleStep === "questions";
}

export function createMeditationPathStartHref(
  parsed: ParsedCreateMeditationRoute,
): string {
  if (!parsed.valid || parsed.path === "pending") return CREATE_MEDITATE_ROOT;
  return createMeditationHref({
    path: parsed.path,
    styleStep: "type",
    fromProgramStep: "pick",
    mix: false,
  });
}

export function createMeditationHrefWithDraft(
  href: string,
  draftSk: string | null | undefined,
): string {
  const sk = draftSk?.trim();
  if (!sk) return href;
  const join = href.includes("?") ? "&" : "?";
  return `${href}${join}draftSk=${encodeURIComponent(sk)}`;
}
