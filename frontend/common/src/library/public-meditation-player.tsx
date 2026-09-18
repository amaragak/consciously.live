import type { ReactNode } from "react";

/** Minimal public listen UI for marketing `/listen` and `/library/[slug]`. */
export function PublicMeditationPlayer({
  title,
  description,
  audioUrl,
  durationLabel,
  brandLabel = "Consciously",
}: {
  title: string;
  description?: string;
  audioUrl: string | null;
  durationLabel?: string;
  brandLabel?: string;
}): ReactNode {
  return (
    <article className="mx-auto w-full max-w-lg px-4 py-12 sm:py-16">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
        {brandLabel}
      </p>
      <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        {title}
      </h1>
      {durationLabel ? (
        <p className="mt-2 text-sm text-muted">{durationLabel}</p>
      ) : null}
      {description ? (
        <p className="mt-4 text-base leading-relaxed text-foreground/85">
          {description}
        </p>
      ) : null}
      {audioUrl ? (
        <audio
          className="mt-8 w-full"
          controls
          preload="metadata"
          src={audioUrl}
        >
          Your browser does not support audio playback.
        </audio>
      ) : (
        <p className="mt-8 text-sm text-muted">Audio is unavailable.</p>
      )}
    </article>
  );
}
