"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { PRE_RELEASE, PRE_RELEASE_MONTH } from "@/lib/pre-release";
import { getMedimadeApiBase } from "@/lib/medimade-api";

export type WaitlistSource = string;

type OpenArgs = { source: WaitlistSource; brief?: string };

type WaitlistApi = {
  open: (args: OpenArgs) => void;
};

const WaitlistContext = createContext<WaitlistApi | null>(null);

export function useWaitlist(): WaitlistApi | null {
  return useContext(WaitlistContext);
}

type JoinResult = {
  status: "joined" | "already" | "updated";
  briefSaved: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function pageUtm(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const utm: Record<string, string> = {};
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
    const value = params.get(key)?.trim();
    if (value) utm[key] = value;
  }
  return utm;
}

export async function joinWaitlist(input: {
  email: string;
  brief?: string;
  source: string;
  company?: string;
}): Promise<JoinResult> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("The waitlist is not available right now.");
  const res = await fetch(`${base.replace(/\/$/, "")}/waitlist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: input.email,
      brief: input.brief?.trim() || undefined,
      source: input.source,
      company: input.company || "",
      referrer: typeof document !== "undefined" ? document.referrer || undefined : undefined,
      utm: pageUtm(),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    status?: JoinResult["status"];
    briefSaved?: boolean;
  };
  if (!res.ok) throw new Error(data.error || "Could not join the waitlist.");
  return {
    status: data.status === "already" || data.status === "updated" ? data.status : "joined",
    briefSaved: Boolean(data.briefSaved),
  };
}

function briefSnippet(brief: string): string {
  const text = brief.trim();
  if (text.length <= 40) return text;
  return `${text.slice(0, 40).trimEnd()}…`;
}

function EmailRow({
  email,
  setEmail,
  error,
  busy,
  emailId,
  onSubmit,
  buttonLabel,
  labeled = true,
}: {
  email: string;
  setEmail: (value: string) => void;
  error: string | null;
  busy: boolean;
  emailId: string;
  onSubmit: (event: FormEvent) => void;
  buttonLabel: string;
  labeled?: boolean;
}) {
  return (
    <form
      className={`new-home-waitlist-form${labeled ? "" : " is-bare"}`}
      onSubmit={onSubmit}
    >
      {labeled ? (
        <label className="new-home-waitlist-label" htmlFor={emailId}>
          Email
        </label>
      ) : (
        <label className="sr-only" htmlFor={emailId}>
          Email
        </label>
      )}
      <div className="new-home-waitlist-row">
        <input
          id={emailId}
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="your@email.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${emailId}-error` : undefined}
        />
        <button type="submit" className="new-home-mist" disabled={busy}>
          {busy ? "Joining…" : buttonLabel}
        </button>
      </div>
      <input
        className="new-home-waitlist-hp"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        name="company"
        defaultValue=""
      />
      {error ? (
        <p id={`${emailId}-error`} className="new-home-waitlist-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export function WaitlistInlineForm() {
  const emailId = useId();
  const companyRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const next = email.trim();
    if (!EMAIL_RE.test(next)) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await joinWaitlist({
        email: next,
        source: "close",
        company: companyRef.current?.value,
      });
      if (result.status === "already") setDone("You're already on the list.");
      else setDone("You're on the list.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join the waitlist.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return <p className="new-home-waitlist-done">{done}</p>;
  }

  return (
    <div className="new-home-waitlist-close">
      <EmailRow
        email={email}
        setEmail={setEmail}
        error={error}
        busy={busy}
        emailId={emailId}
        onSubmit={(event) => {
          const form = event.currentTarget;
          const company = form.querySelector<HTMLInputElement>("[name=company]");
          if (companyRef.current !== company && company) {
            companyRef.current = company;
          }
          void onSubmit(event);
        }}
        buttonLabel="Join the waitlist →"
        labeled={false}
      />
      <p className="new-home-waitlist-note">
        Early access opens {PRE_RELEASE_MONTH}. We&apos;ll email you once, when your spot is ready.
      </p>
    </div>
  );
}

function WaitlistDialog({
  request,
  onClose,
}: {
  request: OpenArgs;
  onClose: () => void;
}) {
  const titleId = useId();
  const emailId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const companyRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ title: string; detail?: string } | null>(null);
  const brief = request.brief?.trim() || "";

  useEffect(() => {
    const root = dialogRef.current;
    const previously = document.activeElement as HTMLElement | null;
    const emailField = root?.querySelector<HTMLInputElement>("input[type=email]");
    emailField?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !root) return;
      const items = [
        ...root.querySelectorAll<HTMLElement>("button, input, a, [href]"),
      ].filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const main = document.querySelector("main");
    const previousMain = main?.style.overflow ?? "";
    if (main) main.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      if (main) main.style.overflow = previousMain;
      previously?.focus();
    };
  }, [onClose]);

  useEffect(() => {
    if (!done) return;
    dialogRef.current?.querySelector<HTMLButtonElement>("button.new-home-mist")?.focus();
  }, [done]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const next = email.trim();
    if (!EMAIL_RE.test(next)) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await joinWaitlist({
        email: next,
        brief,
        source: request.source,
        company: companyRef.current?.value,
      });
      if (result.status === "joined") {
        setDone({
          title: "You're on the list.",
          detail:
            result.briefSaved && brief
              ? `We'll send ‘${briefSnippet(brief)}’ when you're in.`
              : undefined,
        });
      } else if (result.status === "updated" && result.briefSaved) {
        setDone({
          title: "You're already on the list.",
          detail: brief
            ? `We've saved ‘${briefSnippet(brief)}’ with your spot.`
            : "We've saved your meditation with your spot.",
        });
      } else {
        setDone({ title: "You're already on the list." });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join the waitlist.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="new-home-waitlist-overlay" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className="new-home-waitlist-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button type="button" className="new-home-waitlist-x" aria-label="Close" onClick={onClose}>
          ×
        </button>
        {done ? (
          <div className="new-home-waitlist-success">
            <h2 id={titleId} className="new-home-display">
              {done.title}
            </h2>
            {done.detail ? <p>{done.detail}</p> : null}
            <button type="button" className="new-home-mist" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <>
            {brief ? <p className="new-home-waitlist-tag">Coming {PRE_RELEASE_MONTH}</p> : null}
            <h2 id={titleId} className="new-home-display">
              {brief ? "We'll make this one for you first." : "Be first in."}
            </h2>
            {brief ? (
              <div className="new-home-waitlist-quote">
                <span>Your meditation</span>
                <p>“{brief}”</p>
              </div>
            ) : null}
            <p className="new-home-waitlist-copy">
              {brief
                ? "Consciously isn't open yet. Join the waitlist and we'll save this, then send you the finished meditation the day you get access."
                : `Consciously opens ${PRE_RELEASE_MONTH}. Join the waitlist and we'll email you once, when your spot is ready.`}
            </p>
            <EmailRow
              email={email}
              setEmail={(value) => {
                setEmail(value);
                if (error) setError(null);
              }}
              error={error}
              busy={busy}
              emailId={emailId}
              onSubmit={(event) => {
                const company = event.currentTarget.querySelector<HTMLInputElement>(
                  "[name=company]",
                );
                if (company) companyRef.current = company;
                void onSubmit(event);
              }}
              buttonLabel="Join the waitlist →"
            />
            <p className="new-home-waitlist-fine">One email when your spot opens. No spam.</p>
          </>
        )}
      </div>
    </div>
  );
}

export function WaitlistProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<OpenArgs | null>(null);
  const close = useCallback(() => setRequest(null), []);

  if (!PRE_RELEASE) return children;

  return (
    <WaitlistContext.Provider value={{ open: setRequest }}>
      {children}
      {request
        ? createPortal(
            <WaitlistDialog request={request} onClose={close} />,
            document.body,
          )
        : null}
    </WaitlistContext.Provider>
  );
}

export function WaitlistAppLink({
  href,
  source,
  className,
  children,
}: {
  href: string;
  source: string;
  className?: string;
  children: ReactNode;
}) {
  const waitlist = useWaitlist();
  if (!waitlist) {
    return (
      <a className={className} href={href}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" className={className} onClick={() => waitlist.open({ source })}>
      {children}
    </button>
  );
}
