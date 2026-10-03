/**
 * Dev-only horizontal trim for ready-made soundscapes.
 * 100% = current production listen level; drag down to audition quieter.
 */
export function SoundscapeDevVolumeFader({
  value,
  onChange,
  className = "",
}: {
  value: number;
  onChange: (percent: number) => void;
  className?: string;
}) {
  const v = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 100));
  return (
    <div
      className={`flex min-w-0 max-w-[14rem] flex-1 items-center gap-2 ${className}`}
      title="Dev: 100% = production soundscape level (locked from 67% A/B of the old peak). Reductive only."
    >
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-accent-link">
        Vol
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={v}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="h-7 w-full min-w-0 cursor-pointer accent-foreground"
        aria-label="Soundscape listen volume (Dev)"
      />
      <span className="w-8 shrink-0 text-right tabular-nums text-[11px] text-muted">
        {Math.round(v)}
      </span>
    </div>
  );
}
