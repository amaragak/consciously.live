import { useEffect, useMemo, useRef, useState } from "react";
import { SelectChevron } from "@/components/select-chevron";
import type { FocusDisplayId, FocusSessionPrefs, FocusTaskItem } from "@/lib/focus-timer-storage";
import {
  childrenOf,
  dueLabel,
  ensureTracker,
  type TrackerItem,
} from "@/lib/tracker-items";
import type { IdeateStoreV2 } from "@/lib/plan-ideate-store";

const NAVY = "#0F1B2D";
const IVORY = "#F6F1E7";

export function playSoftChime() {
  const Ctx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  const now = ctx.currentTime;
  [523, 784].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const start = now + i * 0.12;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.06, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.55);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.6);
  });
  window.setTimeout(() => void ctx.close(), 900);
}

function IconButton({
  label,
  onClick,
  children,
  pressed,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex h-[30px] w-8 cursor-pointer items-center justify-center rounded-full ${
        pressed ? "text-[#F6F1E7]" : "text-muted hover:text-foreground"
      }`}
      style={pressed ? { background: NAVY } : undefined}
    >
      {children}
    </button>
  );
}

export function TimerFace({
  display,
  remainingSec,
  durationSec,
  progress,
  light = false,
  fit,
}: {
  display: FocusDisplayId;
  remainingSec: number;
  durationSec: number;
  progress: number;
  light?: boolean;
  /** Space left for the clock. Caps the ring, sun, bar and digits so the card stays on screen. */
  fit?: { width: number; height: number };
}) {
  const mm = String(Math.floor(Math.max(0, remainingSec) / 60)).padStart(2, "0");
  const ss = String(Math.max(0, remainingSec) % 60).padStart(2, "0");
  const time = `${mm}:${ss}`;
  const ink = light ? IVORY : NAVY;
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  const fitW = fit?.width ?? (light ? 420 : 360);
  const fitH = fit?.height ?? (light ? 320 : 266);

  if (display === "digits") {
    const timePx = Math.max(40, Math.min(light ? 140 : 120, Math.floor(fitH * 0.5)));
    return (
      <div className="flex flex-col items-center gap-2">
        <p className="font-display leading-none tracking-tight" style={{ color: ink, fontSize: timePx }}>
          {time}
        </p>
        <p className="text-[14px]" style={{ color: light ? "rgba(246,241,231,0.7)" : "#8A8478" }}>
          {pct}% through
        </p>
      </div>
    );
  }

  if (display === "bar") {
    const end = Math.max(1, Math.round(durationSec / 60));
    const barW = Math.max(160, Math.min(560, Math.floor(fitW * 0.9)));
    const timePx = Math.max(36, Math.min(light ? 120 : 92, Math.floor(fitH * 0.42)));
    return (
      <div className="flex flex-col items-center gap-3" style={{ width: barW }}>
        <p className="font-display leading-none tracking-tight" style={{ color: ink, fontSize: timePx }}>
          {time}
        </p>
        <div className="w-full">
          <div className="h-2 overflow-hidden rounded-full" style={{ background: light ? "rgba(246,241,231,0.2)" : "#EFE7D8" }}>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: light ? "#D9B87C" : NAVY }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[12px]" style={{ color: light ? "rgba(246,241,231,0.65)" : "#8A8478" }}>
            <span>0</span>
            <span>{end} min</span>
          </div>
        </div>
      </div>
    );
  }

  if (display === "sun") {
    const angle = Math.PI * (1 - Math.min(1, Math.max(0, progress)));
    const cx = 120;
    const cy = 108;
    const r = 92;
    const x = cx + r * Math.cos(angle);
    const y = cy - r * Math.sin(angle);
    const travel = Math.min(1, Math.max(0, progress));
    let sunW = Math.max(160, Math.min(560, Math.floor(fitW * 0.9)));
    let sunH = Math.round(sunW * (268 / 560));
    const timeCap = light ? 120 : 92;
    if (sunH + timeCap + 8 > fitH) {
      sunW = Math.max(140, Math.floor((fitH - timeCap - 8) / (268 / 560)));
      sunH = Math.round(sunW * (268 / 560));
    }
    const timePx = Math.max(28, Math.min(timeCap, Math.floor(fitH - sunH - 4)));
    return (
      <div className="flex flex-col items-center">
        <svg width={sunW} height={sunH} viewBox="0 0 240 132" aria-hidden>
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none"
            stroke={light ? "rgba(246,241,231,0.35)" : "#E6DDCB"}
            strokeWidth="2"
            strokeDasharray="2 7"
            strokeLinecap="round"
          />
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${x} ${y}`}
            fill="none"
            stroke={light ? "#D9B87C" : NAVY}
            strokeWidth="2.5"
            strokeLinecap="round"
            style={{ opacity: travel > 0.01 ? 1 : 0 }}
          />
          <line x1="28" y1={cy} x2="212" y2={cy} stroke={light ? "rgba(246,241,231,0.45)" : "#E6DDCB"} strokeWidth="1.5" />
          <circle cx={x} cy={y} r="16" fill="#D9B87C" opacity="0.35" />
          <circle cx={x} cy={y} r="9" fill="#D9B87C" />
        </svg>
        <p className="font-display leading-none tracking-tight" style={{ color: ink, fontSize: timePx }}>
          {time}
        </p>
      </div>
    );
  }

  const size = Math.max(88, Math.min(520, Math.floor(Math.min(fitW * 0.92, fitH))));
  const stroke = size >= 200 ? 6 : 8;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - Math.min(1, Math.max(0, progress)));
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={light ? "rgba(246,241,231,0.18)" : "#EFE7D8"} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={light ? "#D9B87C" : NAVY}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
        />
      </svg>
      <p
        className="absolute inset-0 flex items-center justify-center font-display leading-none tracking-tight"
        style={{ color: ink, fontSize: Math.max(28, Math.round(size * 0.278)) }}
      >
        {time}
      </p>
    </div>
  );
}

export function FittedTimerFace(
  props: Omit<Parameters<typeof TimerFace>[0], "fit">,
) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 480, height: 320 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      setBox({
        width: Math.max(1, Math.floor(el.clientWidth)),
        height: Math.max(1, Math.floor(el.clientHeight)),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className="flex h-full w-full items-center justify-center">
      <TimerFace {...props} fit={box} />
    </div>
  );
}

const TIMER_STYLES: { id: FocusDisplayId; label: string; description: string }[] = [
  { id: "ring", label: "Ring", description: "Fills clockwise" },
  { id: "bar", label: "Bar", description: "Fills left to right" },
  { id: "sun", label: "Sun", description: "Rises along an arc" },
  { id: "digits", label: "Digits", description: "Just the time" },
];

function DisplayGlyph({ id, size = 16 }: { id: FocusDisplayId; size?: number }) {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  if (id === "ring") return <svg {...props}><circle cx="12" cy="12" r="8" /></svg>;
  if (id === "bar") return <svg {...props}><rect x="3" y="10" width="18" height="4" rx="2" /></svg>;
  if (id === "sun") {
    return (
      <svg {...props}>
        <path d="M3 17a9 9 0 0118 0" />
        <circle cx="8" cy="10.5" r="2" />
      </svg>
    );
  }
  return (
    <svg {...props}>
      <path d="M5 8h4v8H5zM13 8h6M19 8v8h-6" />
    </svg>
  );
}

export function TimerStyleMenu({
  display,
  onChange,
}: {
  display: FocusDisplayId;
  onChange: (id: FocusDisplayId) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const current = TIMER_STYLES.find((item) => item.id === display) ?? TIMER_STYLES[0];
  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card py-0 pl-3 pr-2.5 text-[13px] text-muted"
      >
        Timer style
        <span className="inline-flex items-center gap-[5px] font-semibold text-foreground">
          <DisplayGlyph id={current.id} size={14} />
          {current.label}
        </span>
        <SelectChevron open={open} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-30 w-[260px] rounded-[18px] border border-border bg-card p-1.5 shadow-[0_18px_44px_rgba(15,27,45,0.18)]"
        >
          {TIMER_STYLES.map((item) => {
            const selected = item.id === display;
            return (
              <button
                key={item.id}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  onChange(item.id);
                  setOpen(false);
                }}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-[9px] text-left"
                style={selected ? { background: "#F6EEDD" } : undefined}
              >
                <span
                  className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg text-foreground"
                  style={{ background: "#F3EBDD" }}
                >
                  <DisplayGlyph id={item.id} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold text-foreground">{item.label}</span>
                  <span className="block text-[12px] text-muted">{item.description}</span>
                </span>
                {selected ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="shrink-0 text-foreground" aria-hidden>
                    <path d="M5 12l5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <span className="w-3.5 shrink-0" aria-hidden />
                )}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className="relative h-6 w-10 shrink-0 cursor-pointer rounded-full"
      style={{ background: on ? NAVY : "#E6DDCB" }}
    >
      <span
        className="absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white"
        style={{ left: on ? 19 : 3 }}
      />
    </button>
  );
}

function Stepper({
  value,
  onChange,
  min = 1,
  max = 180,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        aria-label="Fewer minutes"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-foreground"
      >
        −
      </button>
      <span className="w-10 text-center text-[15px] font-semibold text-foreground">{value}</span>
      <button
        type="button"
        aria-label="More minutes"
        onClick={() => onChange(Math.min(max, value + 1))}
        className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-foreground"
      >
        +
      </button>
    </div>
  );
}

export function SessionTimingPopover({
  prefs,
  onChange,
  onClose,
}: {
  prefs: FocusSessionPrefs;
  onChange: (next: FocusSessionPrefs) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t || ref.current?.contains(t)) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [onClose]);

  const picks = (values: number[], current: number, key: "focusMinutes" | "breakMinutes") => (
    <div className="flex flex-wrap gap-1.5">
      {values.map((mins) => {
        const on = current === mins;
        return (
          <button
            key={mins}
            type="button"
            onClick={() => onChange({ ...prefs, [key]: mins })}
            className="h-8 cursor-pointer rounded-full px-3 text-[13px] font-semibold"
            style={
              on
                ? { background: NAVY, color: IVORY }
                : { background: "#FFFDF8", color: NAVY, border: "1px solid #E6DDCB" }
            }
          >
            {mins}
          </button>
        );
      })}
    </div>
  );

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Session timing"
      className="absolute left-0 top-full z-30 mt-2 w-[min(100%,22rem)] rounded-[18px] border border-border bg-card p-4 shadow-lg"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-foreground">Focus</p>
            <Stepper value={prefs.focusMinutes} max={180} onChange={(focusMinutes) => onChange({ ...prefs, focusMinutes })} />
          </div>
          {picks([15, 25, 45, 60, 90], prefs.focusMinutes, "focusMinutes")}
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-foreground">Break</p>
            <Stepper value={prefs.breakMinutes} max={60} onChange={(breakMinutes) => onChange({ ...prefs, breakMinutes })} />
          </div>
          {picks([3, 5, 10, 15], prefs.breakMinutes, "breakMinutes")}
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13.5px] text-foreground">Longer break every 4 focus sessions</p>
          <Toggle
            label="Longer break every 4 focus sessions"
            on={prefs.longBreakEvery}
            onClick={() => onChange({ ...prefs, longBreakEvery: !prefs.longBreakEvery })}
          />
        </div>
        {prefs.longBreakEvery ? (
          <div className="flex items-center justify-between">
            <p className="text-[13px] text-muted">Longer break</p>
            <Stepper
              value={prefs.longBreakMinutes}
              max={60}
              onChange={(longBreakMinutes) => onChange({ ...prefs, longBreakMinutes })}
            />
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13.5px] text-foreground">Start breaks by themselves</p>
          <Toggle
            label="Start breaks by themselves"
            on={prefs.autoStartBreak}
            onClick={() => onChange({ ...prefs, autoStartBreak: !prefs.autoStartBreak })}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13.5px] text-foreground">Start the next focus by itself</p>
          <Toggle
            label="Start the next focus by itself"
            on={prefs.autoStartFocus}
            onClick={() => onChange({ ...prefs, autoStartFocus: !prefs.autoStartFocus })}
          />
        </div>
        <p className="text-[12px] text-muted">Kept as your default for next time.</p>
      </div>
    </div>
  );
}

export function FocusStrikeTitle({
  text,
  striking,
  className,
}: {
  text: string;
  striking: boolean;
  className?: string;
}) {
  return (
    <span className={`relative min-w-0 max-w-full truncate ${striking ? "text-muted" : "text-foreground"} ${className ?? ""}`}>
      {text}
      {striking ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-1/2 h-[1.5px] origin-left -translate-y-1/2 bg-current animate-focus-strike"
        />
      ) : null}
    </span>
  );
}

export function GoalTick({
  done,
  striking,
  label,
  onClick,
  size = 20,
}: {
  done: boolean;
  striking?: boolean;
  label: string;
  onClick: () => void;
  size?: number;
}) {
  const filled = done || Boolean(striking);
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full border-[1.5px] border-[#E6DDCB] bg-white"
      style={{
        width: size,
        height: size,
        ...(filled ? { background: NAVY, borderColor: NAVY, color: IVORY } : undefined),
      }}
    >
      {filled ? (
        <svg width={size <= 18 ? 10 : 11} height={size <= 18 ? 10 : 11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
          <path d="M5 12l5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </button>
  );
}

function AreaTag({ label }: { label: string }) {
  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded-md bg-[#F6EEDD] px-[7px] text-[10.5px] font-bold uppercase tracking-[0.8px] text-[#8A6424]">
      {label}
    </span>
  );
}

function DragHandle({ taskId }: { taskId?: string }) {
  return (
    <span
      aria-hidden
      draggable={Boolean(taskId)}
      onDragStart={(event) => {
        if (!taskId) return;
        event.dataTransfer.setData("text/plain", taskId);
        event.dataTransfer.effectAllowed = "move";
      }}
      className={`text-[#E6D3AE] ${taskId ? "cursor-grab" : ""}`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <circle cx="9" cy="7" r="1" fill="currentColor" />
        <circle cx="15" cy="7" r="1" fill="currentColor" />
        <circle cx="9" cy="12" r="1" fill="currentColor" />
        <circle cx="15" cy="12" r="1" fill="currentColor" />
        <circle cx="9" cy="17" r="1" fill="currentColor" />
        <circle cx="15" cy="17" r="1" fill="currentColor" />
      </svg>
    </span>
  );
}

export function GoalRows({
  tasks,
  strikingIds,
  onToggle,
  onRemove,
  onReorder,
}: {
  tasks: FocusTaskItem[];
  strikingIds?: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onReorder: (id: string, index: number) => void;
}) {
  /* This session / Later today split, kept for reference and not rendered:
  const session = tasks.filter((task) => !task.done && task.inSession);
  const later = tasks.filter((task) => !task.done && !task.inSession);
  // A gold "This session" block, then "Later today" with a "+ Session" button.
  // "×" moved a session goal back to Later today instead of removing it.
  */
  const todo = tasks.filter((task) => !task.done);
  const done = tasks.filter((task) => task.done);
  const [over, setOver] = useState<string | null>(null);

  const row = (task: FocusTaskItem, group: "todo" | "done", index: number) => {
    const striking = Boolean(strikingIds?.has(task.id));
    return (
    <div
      key={task.id}
      onDragOver={(event) => {
        if (group === "done") return;
        event.preventDefault();
        setOver(`${group}:${index}`);
      }}
      onDrop={(event) => {
        if (group === "done") return;
        event.preventDefault();
        const id = event.dataTransfer.getData("text/plain");
        if (id) onReorder(id, index);
        setOver(null);
      }}
      className={`flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 ${
        over === `${group}:${index}` ? "bg-white/70" : ""
      }`}
    >
      <DragHandle taskId={group === "done" ? undefined : task.id} />
      <GoalTick
        done={task.done}
        striking={striking}
        label={task.done ? `Untick ${task.text}` : `Tick ${task.text}`}
        onClick={() => onToggle(task.id)}
      />
      <span className="flex min-w-0 flex-1 items-center gap-2">
        {task.done ? (
          <span className="min-w-0 truncate text-[14px] font-medium text-muted line-through">
            {task.text}
          </span>
        ) : (
          <FocusStrikeTitle text={task.text} striking={striking} className="text-[14px] font-medium" />
        )}
        {task.lifeAreaTitle ? <AreaTag label={task.lifeAreaTitle} /> : null}
      </span>
      {group === "todo" ? (
        <button
          type="button"
          aria-label="Remove from today"
          title="Remove from today"
          onClick={() => onRemove(task.id)}
          className="inline-flex shrink-0 cursor-pointer text-muted"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      ) : null}
      {/* "+ Session" (moved a Later today goal into This session) removed with the split. */}
    </div>
    );
  };

  return (
    <div className="flex flex-col">
      <div>
        <div className="flex items-center justify-between px-1.5 pb-0.5 pt-1 text-[11px] font-semibold uppercase tracking-[1.4px] text-muted">
          <span>To do</span>
          <span className="font-normal normal-case tracking-normal">{todo.length}</span>
        </div>
        {todo.map((task, index) => row(task, "todo", index))}
      </div>
      {done.length > 0 ? (
        <>
          <p className="px-1.5 pb-0.5 pt-2.5 text-[11px] font-semibold uppercase tracking-[1.4px] text-muted">
            Done
          </p>
          {done.map((task, index) => row(task, "done", index))}
        </>
      ) : null}
    </div>
  );
}

export function ManifestPicker({
  store,
  existingIds,
  onClose,
  onAdd,
}: {
  store: IdeateStoreV2 | null;
  existingIds: Set<string>;
  onClose: () => void;
  onAdd: (items: TrackerItem[]) => void;
}) {
  const [area, setArea] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"tracker" | "az" | "due">("tracker");
  const [picks, setPicks] = useState<string[]>([]);
  const ensured = useMemo(() => (store ? ensureTracker(store) : null), [store]);
  const areas = useMemo(() => {
    if (!ensured) return [];
    return ensured.dreams.filter((dream) => !dream.completedAt);
  }, [ensured]);
  const rows = useMemo(() => {
    if (!ensured) return [];
    const items = ensured.trackerItems ?? [];
    const roots = childrenOf(items, null).filter((item) => area === "all" || item.lifeAreaId === area);
    const ordered: TrackerItem[] = [];
    const walk = (node: TrackerItem) => {
      ordered.push(node);
      childrenOf(items, node.id).forEach(walk);
    };
    roots.forEach(walk);
    let list = ordered.filter((item) => item.title.trim() && item.status !== "done");
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((item) => item.title.toLowerCase().includes(q));
    if (sort === "az") {
      list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    } else if (sort === "due") {
      list = [...list].sort((a, b) => {
        if (a.due && b.due) return a.due.localeCompare(b.due);
        if (a.due) return -1;
        if (b.due) return 1;
        return 0;
      });
    }
    return list;
  }, [ensured, area, query, sort]);

  const areaTitle = (id: string) => areas.find((dream) => dream.id === id)?.title?.trim() || "";

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 sm:items-center" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Add from Manifest"
        className="flex max-h-[min(720px,100%)] w-full max-w-[560px] flex-col overflow-hidden rounded-[18px] border border-border bg-card shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="font-display text-[22px] text-foreground">Add from Manifest</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="cursor-pointer text-muted">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="flex gap-1.5 overflow-x-auto px-5 pb-3">
          {[{ id: "all", title: "All areas" }, ...areas.map((dream) => ({ id: dream.id, title: dream.title }))].map((chip) => {
            const on = area === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setArea(chip.id)}
                className="h-8 shrink-0 cursor-pointer rounded-full px-3 text-[13px] font-semibold"
                style={on ? { background: NAVY, color: IVORY } : { border: "1px solid #E6DDCB", color: NAVY }}
              >
                {chip.title}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2 px-5 pb-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search your Tracker"
            className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-card px-3 text-[14px] text-foreground outline-none"
          />
          <label className="relative">
            <span className="sr-only">Sort</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as "tracker" | "az" | "due")}
              className="h-10 cursor-pointer appearance-none rounded-xl border border-border bg-card pl-3 pr-8 text-[13px] font-semibold text-foreground"
            >
              <option value="tracker">Tracker order</option>
              <option value="az">A–Z</option>
              <option value="due">Next due</option>
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
              <SelectChevron />
            </span>
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
          {rows.length === 0 ? (
            <p className="px-2 py-6 text-center text-[14px] text-muted">Nothing in the Tracker matches.</p>
          ) : (
            rows.map((item) => {
              const already = existingIds.has(item.id);
              const on = already || picks.includes(item.id);
              const due = dueLabel(item.due);
              return (
                <label key={item.id} className="flex cursor-pointer items-center gap-3 rounded-[10px] px-2 py-2.5 hover:bg-nav-active">
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={already}
                    onChange={() => {
                      if (already) return;
                      setPicks((prev) => (prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]));
                    }}
                    className="h-4 w-4 accent-[#0F1B2D]"
                  />
                  <span className="min-w-0 flex-1 truncate text-[14.5px] text-foreground">{item.title}</span>
                  <span className="shrink-0 text-[12px] text-muted">
                    {[areaTitle(item.lifeAreaId), due].filter(Boolean).join(" · ")}
                  </span>
                </label>
              );
            })
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
          <p className="text-[12.5px] text-muted">Ticking one off in Focus ticks it in the Tracker too.</p>
          <button
            type="button"
            disabled={picks.length === 0}
            onClick={() => onAdd(rows.filter((item) => picks.includes(item.id)))}
            className="h-10 shrink-0 cursor-pointer rounded-full bg-accent-button px-4 text-[14px] font-semibold text-on-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add {picks.length}
          </button>
        </div>
      </div>
    </div>
  );
}
