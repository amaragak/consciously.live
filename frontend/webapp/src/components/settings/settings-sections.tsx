import { Link } from "react-router-dom";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  SettingsCard,
  SettingsRow,
  SettingsSegmented,
  SettingsStatusMarker,
  SettingsSwitch,
  settingsRowDisabled,
} from "@/components/settings/settings-primitives";
import { SETTINGS_STATUS } from "@/lib/settings-status";
import { AI_PROVIDERS, SHOW_AI_TRAINING_CLAIM } from "@/lib/ai-providers";
import {
  cognitoChangePassword,
  cognitoConfirmForgotPassword,
  cognitoForgotPassword,
} from "@/lib/cognito-direct-auth";
import {
  emptyAssistantChatStore,
  saveAssistantChatStore,
} from "@/lib/assistant-chat-storage";
import {
  fetchCognitoAuthConfig,
  listLibraryMeditations,
  putAssistantChatStoreRemote,
  saveMedimadeProfileDisplayName,
  type CognitoAuthConfig,
} from "@/lib/medimade-api";
import {
  getMedimadeSessionDisplayName,
  getMedimadeSessionEmail,
  setMedimadeSession,
} from "@/lib/auth-session";
import { journalLockIsSet } from "@/lib/journal-prefs";
import { getSessionPrivileges } from "@/lib/session-privileges";
import { shouldShowSettingsRow } from "@/lib/settings-status";
import { COLOR_SCHEME_OPTIONS, setColorScheme } from "@/lib/color-scheme";
import type {
  ChatActionMode,
  MeditationVisibility,
  MeditateType,
  NudgeStyle,
  ThemePreference,
  UserSettingsV1,
} from "@/lib/user-settings";

export type SettingsSectionId =
  | "account"
  | "ai"
  | "privacy"
  | "notifications"
  | "email"
  | "meditate"
  | "focus"
  | "general";

type SectionProps = {
  settings: UserSettingsV1;
  onPatch: (patch: Record<string, unknown>) => void;
};

function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-confirm-title"
        className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          id="settings-confirm-title"
          className="font-display text-lg font-medium text-foreground"
        >
          {title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="rounded-xl border border-border px-4 py-2 text-sm font-medium hover:border-accent/40"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            className={`rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50 ${
              danger
                ? "border border-danger/40 text-danger hover:bg-danger/5"
                : "accent-fill-gradient text-on-accent"
            }`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function useDebouncedCommit(
  value: string,
  commit: (v: string) => void,
  delayMs = 600,
) {
  const commitRef = useRef(commit);
  const skipRef = useRef(true);
  commitRef.current = commit;
  useEffect(() => {
    if (skipRef.current) {
      skipRef.current = false;
      return;
    }
    const t = window.setTimeout(() => commitRef.current(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
}

function AccountSection(_props: SectionProps) {
  void _props;
  const email = getMedimadeSessionEmail()?.trim() ?? "";
  const [cognito, setCognito] = useState<CognitoAuthConfig | null>(null);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(
    () => getMedimadeSessionDisplayName()?.trim() ?? "",
  );
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSaved, setNameSaved] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchCognitoAuthConfig()
      .then((c) => {
        if (!cancelled) setCognito(c);
      })
      .catch(() => {
        if (!cancelled) setCognito(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const sync = () => {
      setNameDraft(getMedimadeSessionDisplayName()?.trim() ?? "");
    };
    window.addEventListener("medimade-session-changed", sync);
    return () => window.removeEventListener("medimade-session-changed", sync);
  }, []);

  const commitName = useCallback(async (raw: string) => {
    const trimmed = raw.trim().replace(/\s+/g, " ");
    if (!trimmed) {
      setNameError("Enter a name");
      return;
    }
    if (trimmed.length > 80) {
      setNameError("Keep it under 80 characters");
      return;
    }
    const current = getMedimadeSessionDisplayName()?.trim() ?? "";
    if (trimmed === current) return;
    setNameError(null);
    setNameSaved(false);
    try {
      const { token, displayName } =
        await saveMedimadeProfileDisplayName(trimmed);
      setMedimadeSession(token, getMedimadeSessionEmail(), displayName);
      setNameDraft(displayName);
      setNameSaved(true);
      window.setTimeout(() => setNameSaved(false), 2000);
    } catch (e) {
      setNameError(e instanceof Error ? e.message : "Could not save name");
    }
  }, []);

  useDebouncedCommit(nameDraft, (v) => {
    void commitName(v);
  });

  const methodLabels: string[] = [];
  if (cognito?.methods.password) methodLabels.push("Password");
  if (cognito?.methods.passkey) methodLabels.push("Passkey");
  if (cognito?.methods.social) methodLabels.push("Google");

  const passwordEnabled = Boolean(cognito?.enabled && cognito.methods.password);
  const cognitoEnabled = Boolean(cognito?.enabled);

  const rows: ReactNode[] = [];

  if (shouldShowSettingsRow("account.displayName")) {
    rows.push(
      <SettingsRow
        key="displayName"
        settingsKey="account.displayName"
        title="Name"
        helper={
          nameError
            ? nameError
            : nameSaved
              ? "Saved."
              : "How you appear across Consciously."
        }
        control={
          <input
            type="text"
            value={nameDraft}
            maxLength={80}
            autoComplete="name"
            aria-label="Display name"
            aria-invalid={nameError ? true : undefined}
            onChange={(e) => {
              setNameError(null);
              setNameSaved(false);
              setNameDraft(e.target.value);
            }}
            onBlur={() => void commitName(nameDraft)}
            className="w-full max-w-[240px] rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent/50"
          />
        }
      />,
    );
  }

  if (shouldShowSettingsRow("account.email")) {
    rows.push(
      <SettingsRow
        key="email"
        settingsKey="account.email"
        title="Email address"
        helper="The address you sign in with."
        control={
          <span className="max-w-[220px] truncate text-sm text-foreground">
            {email || "—"}
          </span>
        }
      />,
    );
  }

  if (shouldShowSettingsRow("account.changeEmail")) {
    rows.push(
      <SettingsRow
        key="changeEmail"
        settingsKey="account.changeEmail"
        title="Change email"
        helper="We’ll send a verification link to your new address."
        control={
          <button
            type="button"
            disabled={settingsRowDisabled("account.changeEmail")}
            className="rounded-full border border-border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          >
            Change…
          </button>
        }
      />,
    );
  }

  if (shouldShowSettingsRow("account.changePassword")) {
    rows.push(
      <SettingsRow
        key="changePassword"
        settingsKey="account.changePassword"
        title="Password"
        helper={
          passwordEnabled
            ? "Change the password you use to sign in."
            : cognitoEnabled
              ? "You sign in with a passkey or Google, so there’s no password here."
              : "There’s no password on this account."
        }
        control={
          <button
            type="button"
            disabled={!passwordEnabled || !email}
            className="rounded-full border border-border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => setPasswordOpen((v) => !v)}
            aria-expanded={passwordOpen}
          >
            {passwordOpen ? "Close" : "Change…"}
          </button>
        }
      />,
    );
  }

  if (shouldShowSettingsRow("account.sessions")) {
    rows.push(
      <SettingsRow
        key="sessions"
        settingsKey="account.sessions"
        title="Active sessions"
        helper="See where you’re signed in and revoke access."
        control={
          <button
            type="button"
            disabled={settingsRowDisabled("account.sessions")}
            className="rounded-full border border-border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          >
            View
          </button>
        }
      />,
    );
  }

  if (shouldShowSettingsRow("account.signOutEverywhere")) {
    rows.push(
      <SettingsRow
        key="signOut"
        settingsKey="account.signOutEverywhere"
        title="Sign out everywhere"
        helper="Signs you out on every device. You’ll need to sign in again."
        control={
          <button
            type="button"
            className="rounded-full border border-danger/40 px-4 py-2 text-sm font-medium text-danger hover:bg-danger/5"
            onClick={() => setSignOutOpen(true)}
          >
            Sign out…
          </button>
        }
      />,
    );
  }

  if (
    shouldShowSettingsRow("account.signInMethods") ||
    shouldShowSettingsRow("account.passkeys")
  ) {
    rows.push(
      <SettingsRow
        key="signInMethods"
        settingsKey="account.signInMethods"
        title="Sign-in methods"
        helper={
          methodLabels.length
            ? `You can sign in with ${methodLabels.join(", ")}.`
            : "How you sign in to Consciously."
        }
        control={
          <span className="text-sm text-muted">
            {methodLabels.length ? methodLabels.join(" · ") : "—"}
          </span>
        }
      />,
    );
  }

  if (shouldShowSettingsRow("account.export")) {
    rows.push(
      <SettingsRow
        key="export"
        settingsKey="account.export"
        title="Export all my data"
        helper="Journals, meditations, and goals — emailed as a link when ready."
        control={
          <button
            type="button"
            disabled={settingsRowDisabled("account.export")}
            className="rounded-full border border-border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          >
            Request…
          </button>
        }
      />,
    );
  }

  if (shouldShowSettingsRow("account.delete")) {
    rows.push(
      <SettingsRow
        key="delete"
        settingsKey="account.delete"
        title="Delete account and all data"
        helper="Permanent. You’ll be asked to confirm before anything is deleted."
        control={
          <button
            type="button"
            disabled={settingsRowDisabled("account.delete")}
            className="rounded-full border border-danger/40 px-4 py-2 text-sm font-medium text-danger disabled:cursor-not-allowed disabled:opacity-50"
          >
            Delete…
          </button>
        }
      />,
    );
  }

  if (!rows.length) return null;

  return (
    <>
      <SettingsCard>{rows}</SettingsCard>
      {passwordOpen && passwordEnabled && cognito && email ? (
        <AccountPasswordPanel
          email={email}
          config={cognito}
          onDone={() => setPasswordOpen(false)}
        />
      ) : null}
      <ConfirmDialog
        open={signOutOpen}
        title="Sign out everywhere?"
        body="This device and any others will need to sign in again."
        confirmLabel="Sign out"
        danger
        onCancel={() => setSignOutOpen(false)}
        onConfirm={() => {
          setSignOutOpen(false);
          window.dispatchEvent(new CustomEvent("settings-sign-out"));
        }}
      />
    </>
  );
}

function AccountPasswordPanel({
  email,
  config,
  onDone,
}: {
  email: string;
  config: CognitoAuthConfig;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"change" | "forgot" | "reset">("change");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (mode === "forgot") {
      setBusy(true);
      try {
        await cognitoForgotPassword(config, email);
        setNotice(`We sent a reset code to ${email}.`);
        setMode("reset");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not send code");
      } finally {
        setBusy(false);
      }
      return;
    }

    if (newPassword.length < 8) {
      setError("Use at least 8 characters for the new password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords don’t match.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "reset") {
        if (!code.trim()) {
          setError("Enter the code from your email.");
          setBusy(false);
          return;
        }
        await cognitoConfirmForgotPassword(config, email, code, newPassword);
      } else {
        if (!currentPassword) {
          setError("Enter your current password.");
          setBusy(false);
          return;
        }
        await cognitoChangePassword(
          config,
          email,
          currentPassword,
          newPassword,
        );
      }
      setNotice("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setCode("");
      window.setTimeout(onDone, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update password");
    } finally {
      setBusy(false);
    }
  }

  const fieldClass =
    "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent/50";

  return (
    <SettingsCard>
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {mode === "change"
                ? "Change password"
                : mode === "forgot"
                  ? "Reset password"
                  : "Enter reset code"}
            </p>
            <p className="mt-1 text-xs text-muted">
              {mode === "change"
                ? `For ${email}`
                : mode === "forgot"
                  ? `We’ll email a code to ${email}.`
                  : `Code sent to ${email}.`}
            </p>
          </div>
          {mode === "change" ? (
            <button
              type="button"
              className="text-xs font-medium text-accent-link underline-offset-2 hover:underline"
              onClick={() => {
                setError(null);
                setNotice(null);
                setMode("forgot");
              }}
            >
              Forgot current password?
            </button>
          ) : mode !== "change" ? (
            <button
              type="button"
              className="text-xs font-medium text-muted underline-offset-2 hover:underline"
              onClick={() => {
                setError(null);
                setNotice(null);
                setMode("change");
              }}
            >
              Back to change
            </button>
          ) : null}
        </div>

        {mode === "change" ? (
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted">Current password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={fieldClass}
              required
            />
          </label>
        ) : null}

        {mode === "reset" ? (
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted">Email code</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={fieldClass}
              required
            />
          </label>
        ) : null}

        {mode === "change" || mode === "reset" ? (
          <>
      <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted">New password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={fieldClass}
                required
                minLength={8}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted">
                Confirm new password
              </span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={fieldClass}
                required
                minLength={8}
              />
            </label>
          </>
        ) : null}

        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="text-sm text-foreground" role="status">
            {notice}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-full accent-fill-gradient px-4 py-2 text-sm font-medium text-on-accent disabled:opacity-50"
          >
            {busy
              ? "Working…"
              : mode === "forgot"
                ? "Send code"
                : "Save password"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDone}
            className="rounded-full border border-border px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </SettingsCard>
  );
}

function AiSection({ settings, onPatch }: SectionProps) {
  const [clearOpen, setClearOpen] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);

  const chatModes: { value: ChatActionMode; label: string }[] = [
    { value: "suggest", label: "Suggest only" },
    { value: "ask", label: "Ask first" },
    { value: "act", label: "Act" },
  ];

  const providerBlock = shouldShowSettingsRow("ai.providers") ? (
    <SettingsCard>
      <div className="space-y-3 px-4 py-4 sm:px-5">
        <p className="text-sm font-semibold text-foreground">
          Who processes your data
        </p>
        <dl className="grid gap-2 text-sm sm:grid-cols-[minmax(0,11rem)_1fr] sm:gap-x-4">
          {AI_PROVIDERS.map((p) => (
            <div key={p.id} className="contents">
              <dt className="font-medium text-foreground">{p.name}</dt>
              <dd className="text-muted">{p.summary}</dd>
            </div>
          ))}
        </dl>
        {SHOW_AI_TRAINING_CLAIM && shouldShowSettingsRow("ai.trainingClaim") ? (
          <p className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground">
            Your content is never used to train AI models.{" "}
            <Link to="/privacy" className="font-medium underline-offset-4 hover:underline">
              Privacy policy
            </Link>
          </p>
        ) : null}
      </div>
    </SettingsCard>
  ) : null;

  const prefRows: ReactNode[] = [];

  if (shouldShowSettingsRow("ai.personaliseWithJournal")) {
    prefRows.push(
      <SettingsRow
        key="personalise"
        settingsKey="ai.personaliseWithJournal"
        title="Personalise with my journal"
        helper="Let meditations and Chat draw on your journal entries. Off means they only use what you type into them."
        control={
          <SettingsSwitch
            aria-label="Personalise with my journal"
            checked={settings.ai.personaliseWithJournal}
            disabled={settingsRowDisabled("ai.personaliseWithJournal")}
            onCheckedChange={
              settingsRowDisabled("ai.personaliseWithJournal")
                ? undefined
                : (v) => onPatch({ ai: { personaliseWithJournal: v } })
            }
          />
        }
      />,
    );
  }

  if (shouldShowSettingsRow("ai.insightsFromJournal")) {
    prefRows.push(
      <SettingsRow
        key="insights"
        settingsKey="ai.insightsFromJournal"
        title="Insights from my journal"
        helper="Weekly letters, patterns and themes. Nothing is generated until you ask for it."
        control={
          <SettingsSwitch
            aria-label="Insights from my journal"
            checked={settings.ai.insightsFromJournal}
            disabled={settingsRowDisabled("ai.insightsFromJournal")}
            onCheckedChange={
              settingsRowDisabled("ai.insightsFromJournal")
                ? undefined
                : (v) => onPatch({ ai: { insightsFromJournal: v } })
            }
          />
        }
      />,
    );
  }

  if (shouldShowSettingsRow("ai.chatActionMode")) {
    prefRows.push(
      <SettingsRow
        key="chatMode"
        settingsKey="ai.chatActionMode"
        title="What Chat can do"
        helper="Whether Chat only suggests, asks before changing anything, or acts straight away (creating goals, starting sessions)."
        control={
          <SettingsSegmented
            aria-label="What Chat can do"
            value={settings.ai.chatActionMode}
            options={chatModes}
            disabled={settingsRowDisabled("ai.chatActionMode")}
            onChange={
              settingsRowDisabled("ai.chatActionMode")
                ? undefined
                : (v) => onPatch({ ai: { chatActionMode: v } })
            }
          />
        }
      />,
    );
  }

  const actionRows: ReactNode[] = [];

  if (shouldShowSettingsRow("ai.deleteAiData")) {
    actionRows.push(
      <SettingsRow
        key="deleteAi"
        settingsKey="ai.deleteAiData"
        title="Delete AI-made data"
        helper="Removes themes, scores and letters made from your journal. Your entries stay."
        control={
          <button
            type="button"
            disabled={settingsRowDisabled("ai.deleteAiData")}
            className="rounded-full border border-danger/40 px-4 py-2 text-sm font-medium text-danger disabled:cursor-not-allowed disabled:opacity-50"
          >
            Delete…
          </button>
        }
      />,
    );
  }

  if (shouldShowSettingsRow("ai.clearChat")) {
    actionRows.push(
      <SettingsRow
        key="clearChat"
        settingsKey="ai.clearChat"
        title="Clear chat history"
        helper="Deletes all past Chat conversations."
        control={
          <button
            type="button"
            className="rounded-full border border-danger/40 px-4 py-2 text-sm font-medium text-danger hover:bg-danger/5"
            onClick={() => setClearOpen(true)}
          >
            Clear…
          </button>
        }
      />,
    );
  }

  if (shouldShowSettingsRow("ai.modelTier")) {
    actionRows.push(
      <SettingsRow
        key="modelTier"
        settingsKey="ai.modelTier"
        title="AI quality"
        helper="Prefer faster replies, or take a bit longer for richer ones."
        control={
          <SettingsSegmented
            aria-label="Model tier"
            value="standard"
            options={[
              { value: "standard", label: "Standard" },
              { value: "quality", label: "Quality" },
            ]}
            disabled
          />
        }
      />,
    );
  }

  if (!providerBlock && !prefRows.length && !actionRows.length) return null;

  return (
    <>
      {providerBlock}
      {prefRows.length ? <SettingsCard>{prefRows}</SettingsCard> : null}
      {actionRows.length ? <SettingsCard>{actionRows}</SettingsCard> : null}
      <ConfirmDialog
        open={clearOpen}
        title="Clear all chat history?"
        body="This removes every Chat thread on this account. It cannot be undone."
        confirmLabel="Clear history"
        danger
        busy={clearBusy}
        onCancel={() => setClearOpen(false)}
        onConfirm={() => {
          setClearBusy(true);
          const empty = emptyAssistantChatStore();
          saveAssistantChatStore(empty);
          void putAssistantChatStoreRemote(empty)
            .catch(() => {
              /* local cleared */
            })
            .finally(() => {
              setClearBusy(false);
              setClearOpen(false);
            });
        }}
      />
    </>
  );
}

function PrivacySection({ settings, onPatch }: SectionProps) {
  const [activeLinks, setActiveLinks] = useState<number | null>(null);
  const [nameDraft, setNameDraft] = useState(
    () => getMedimadeSessionDisplayName()?.trim() ?? "",
  );
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listLibraryMeditations()
      .then((items) => {
        if (cancelled) return;
        const n = items.filter(
          (m) =>
            !m.isDraft &&
            !m.archived &&
            typeof m.shareToken === "string" &&
            m.shareToken.trim(),
        ).length;
        setActiveLinks(n);
      })
      .catch(() => {
        if (!cancelled) setActiveLinks(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const commitName = useCallback(async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const current = getMedimadeSessionDisplayName()?.trim() ?? "";
    if (trimmed === current) return;
    setNameError(null);
    try {
      const { token, displayName } =
        await saveMedimadeProfileDisplayName(trimmed);
      const email = getMedimadeSessionEmail();
      setMedimadeSession(token, email, displayName);
    } catch (e) {
      setNameError(e instanceof Error ? e.message : "Could not save name");
    }
  }, []);

  useDebouncedCommit(nameDraft, (v) => {
    void commitName(v);
  });

  const visOptions: { value: MeditationVisibility; label: string }[] = [
    { value: "private", label: "Private" },
    { value: "link", label: "Link only" },
    { value: "public", label: "Public" },
  ];

  const card1: ReactNode[] = [];
  const card2: ReactNode[] = [];
  const card3: ReactNode[] = [];

  if (shouldShowSettingsRow("privacy.journalLock")) {
    const pinSet = journalLockIsSet();
    card1.push(
      <SettingsRow
        key="journalLock"
        settingsKey="privacy.journalLock"
        title="Journal lock"
        helper={
          pinSet
            ? "Journal is locked on this device. You’ll be asked for your PIN or fingerprint to open it."
            : "Ask for Face ID, fingerprint, or a PIN before opening Journal on this device."
        }
        control={
          <SettingsSwitch
            aria-label="Journal lock"
            checked={settings.privacy.journalLock || pinSet}
            onCheckedChange={(v) =>
              onPatch({ privacy: { journalLock: v } })
            }
          />
        }
      />,
    );
  }

  if (shouldShowSettingsRow("privacy.newMeditationVisibility")) {
    card1.push(
      <SettingsRow
        key="vis"
        settingsKey="privacy.newMeditationVisibility"
        title="New meditations are"
        helper="You can change this for each meditation."
        control={
          <SettingsSegmented
            aria-label="Default visibility for new meditations"
            value={settings.privacy.newMeditationVisibility}
            options={visOptions}
            disabled={settingsRowDisabled("privacy.newMeditationVisibility")}
            onChange={
              settingsRowDisabled("privacy.newMeditationVisibility")
                ? undefined
                : (v) =>
                    onPatch({ privacy: { newMeditationVisibility: v } })
            }
          />
        }
      />,
    );
  }

  if (shouldShowSettingsRow("privacy.sharedLinks")) {
    card1.push(
      <SettingsRow
        key="shared"
        settingsKey="privacy.sharedLinks"
        title="Shared links"
        helper={
          activeLinks === null
            ? "Meditations you’ve shared with a private link."
            : `${activeLinks} active link${activeLinks === 1 ? "" : "s"}. You can revoke any of them anytime.`
        }
        control={
          <Link
            to="/meditate/library/creations"
            className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:border-accent/40"
          >
            Manage
          </Link>
        }
      />,
    );
  }

  if (shouldShowSettingsRow("privacy.communityName")) {
    card2.push(
      <SettingsRow
        key="name"
        settingsKey="privacy.communityName"
        title="Community name"
        helper={
          nameError ?? "How you appear in Connect."
        }
        control={
          <input
            type="text"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            className="w-[220px] max-w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            aria-label="Community name"
          />
        }
      />,
    );
  }

  if (shouldShowSettingsRow("privacy.postAnonymously")) {
    card2.push(
      <SettingsRow
        key="anon"
        settingsKey="privacy.postAnonymously"
        title="Post anonymously by default"
        helper="Your name and avatar are hidden on new posts and replies."
        control={
          <SettingsSwitch
            aria-label="Post anonymously by default"
            checked={settings.privacy.postAnonymously}
            disabled={settingsRowDisabled("privacy.postAnonymously")}
            onCheckedChange={
              settingsRowDisabled("privacy.postAnonymously")
                ? undefined
                : (v) => onPatch({ privacy: { postAnonymously: v } })
            }
          />
        }
      />,
    );
  }

  if (shouldShowSettingsRow("privacy.showActivityInConnect")) {
    card2.push(
      <SettingsRow
        key="activity"
        settingsKey="privacy.showActivityInConnect"
        title="Show my activity in Connect"
        helper="Others can see when you’ve replied or liked something."
        control={
          <SettingsSwitch
            aria-label="Show my activity in Connect"
            checked={settings.privacy.showActivityInConnect}
            disabled={settingsRowDisabled("privacy.showActivityInConnect")}
            onCheckedChange={
              settingsRowDisabled("privacy.showActivityInConnect")
                ? undefined
                : (v) => onPatch({ privacy: { showActivityInConnect: v } })
            }
          />
        }
      />,
    );
  }

  if (shouldShowSettingsRow("privacy.blockedMuted")) {
    card2.push(
      <SettingsRow
        key="blocked"
        settingsKey="privacy.blockedMuted"
        title="Blocked people and muted threads"
        helper="None yet."
        control={
          <button
            type="button"
            disabled={settingsRowDisabled("privacy.blockedMuted")}
            className="rounded-full border border-border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          >
            View
          </button>
        }
      />,
    );
  }

  if (shouldShowSettingsRow("privacy.shareAnonymousUsage")) {
    card3.push(
      <SettingsRow
        key="usage"
        settingsKey="privacy.shareAnonymousUsage"
        title="Share anonymous usage data"
        helper="Helps us see which features are used. Never includes what you write or say."
        control={
          <SettingsSwitch
            aria-label="Share anonymous usage data"
            checked={settings.privacy.shareAnonymousUsage}
            disabled={settingsRowDisabled("privacy.shareAnonymousUsage")}
            onCheckedChange={
              settingsRowDisabled("privacy.shareAnonymousUsage")
                ? undefined
                : (v) => onPatch({ privacy: { shareAnonymousUsage: v } })
            }
          />
        }
      />,
    );
  }

  const any =
    card1.length || card2.length || card3.length;
  if (!any) return null;

  return (
    <>
      {card1.length ? <SettingsCard>{card1}</SettingsCard> : null}
      {card2.length ? <SettingsCard>{card2}</SettingsCard> : null}
      {card3.length ? <SettingsCard>{card3}</SettingsCard> : null}
    </>
  );
}

function NotificationsSection({ settings, onPatch }: SectionProps) {
  type Cat = keyof Pick<
    UserSettingsV1["notifications"],
    "reminders" | "repliesInConnect" | "meditationReady" | "streaksNudges"
  >;
  const categories: { key: Cat; label: string }[] = [
    { key: "reminders", label: "Reminders" },
    { key: "repliesInConnect", label: "Replies in Connect" },
    { key: "meditationReady", label: "Meditation ready" },
    { key: "streaksNudges", label: "Streaks & nudges" },
  ];

  const gridDisabled = settingsRowDisabled("notifications.grid");
  const showGrid = shouldShowSettingsRow("notifications.grid");

  const nudgeOptions: { value: NudgeStyle; label: string }[] = [
    { value: "none", label: "None" },
    { value: "gentle", label: "Gentle" },
    { value: "regular", label: "Regular" },
  ];

  const rows: ReactNode[] = [];

  if (showGrid) {
    rows.push(
      <div
        key="grid"
        className="border-t border-border/60 px-4 py-4 first:border-t-0 sm:px-5"
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-foreground">Channels</p>
          <SettingsStatusMarker status={SETTINGS_STATUS["notifications.grid"]} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px] text-left text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th className="pb-2 pr-4 font-medium">Category</th>
                <th className="pb-2 px-2 font-medium">Push</th>
                <th className="pb-2 px-2 font-medium">Email</th>
                <th className="pb-2 pl-2 font-medium">In-app</th>
              </tr>
            </thead>
            <tbody>
              {categories.map(({ key, label }) => {
                const ch = settings.notifications[key];
                return (
                  <tr key={key} className="border-t border-border/40">
                    <td className="py-2 pr-4 font-medium text-foreground">
                      {label}
                    </td>
                    {(["push", "email", "inApp"] as const).map((col) => (
                      <td key={col} className="px-2 py-2">
                        <input
                          type="checkbox"
                          disabled={gridDisabled}
                          checked={ch[col]}
                          aria-label={`${label} ${col}`}
                          onChange={(e) => {
                            if (gridDisabled) return;
                            onPatch({
                              notifications: {
                                [key]: { ...ch, [col]: e.target.checked },
                              },
                            });
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">
          In-app is on by default. Turn on email or push if you’d like those too.
        </p>
      </div>,
    );
  }

  if (shouldShowSettingsRow("notifications.dailyReminder")) {
    rows.push(
      <SettingsRow
        key="daily"
        settingsKey="notifications.dailyReminder"
        title="Daily reminder"
        helper="Meditation or journal at a time you choose."
        control={
          <SettingsSwitch
            aria-label="Daily reminder"
            checked={settings.notifications.dailyReminder.enabled}
            disabled={settingsRowDisabled("notifications.dailyReminder")}
            onCheckedChange={
              settingsRowDisabled("notifications.dailyReminder")
                ? undefined
                : (v) =>
                    onPatch({
                      notifications: {
                        dailyReminder: {
                          ...settings.notifications.dailyReminder,
                          enabled: v,
                        },
                      },
                    })
            }
          />
        }
      />,
    );
  }

  if (shouldShowSettingsRow("notifications.focusAlerts")) {
    rows.push(
      <SettingsRow
        key="focusAlerts"
        settingsKey="notifications.focusAlerts"
        title="Focus session alerts"
        helper="Notify when a focus or break block starts and ends."
        control={
          <SettingsSwitch
            aria-label="Focus session alerts"
            checked={settings.notifications.focusSessionAlerts}
            disabled={settingsRowDisabled("notifications.focusAlerts")}
            onCheckedChange={
              settingsRowDisabled("notifications.focusAlerts")
                ? undefined
                : (v) =>
                    onPatch({ notifications: { focusSessionAlerts: v } })
            }
          />
        }
      />,
    );
  }

  if (shouldShowSettingsRow("notifications.quietHours")) {
    rows.push(
      <SettingsRow
        key="quiet"
        settingsKey="notifications.quietHours"
        title="Quiet hours"
        helper="No nudges between the times you set."
        control={
          <SettingsSwitch
            aria-label="Quiet hours"
            checked={settings.notifications.quietHours.enabled}
            disabled={settingsRowDisabled("notifications.quietHours")}
            onCheckedChange={
              settingsRowDisabled("notifications.quietHours")
                ? undefined
                : (v) =>
                    onPatch({
                      notifications: {
                        quietHours: {
                          ...settings.notifications.quietHours,
                          enabled: v,
                        },
                      },
                    })
            }
          />
        }
      />,
    );
  }

  if (shouldShowSettingsRow("notifications.nudgeStyle")) {
    rows.push(
      <SettingsRow
        key="nudge"
        settingsKey="notifications.nudgeStyle"
        title="Nudge style"
        helper="How often we remind you. We never guilt-trip."
        control={
          <SettingsSegmented
            aria-label="Nudge style"
            value={settings.notifications.nudgeStyle}
            options={nudgeOptions}
            disabled={settingsRowDisabled("notifications.nudgeStyle")}
            onChange={
              settingsRowDisabled("notifications.nudgeStyle")
                ? undefined
                : (v) => onPatch({ notifications: { nudgeStyle: v } })
            }
          />
        }
      />,
    );
  }

  if (!rows.length) return null;

  return (
    <>
      <SettingsCard>{rows}</SettingsCard>
    </>
  );
}

function EmailSection({ settings, onPatch }: SectionProps) {
  const rows: ReactNode[] = [];

  if (shouldShowSettingsRow("email.transactional")) {
    rows.push(
      <SettingsRow
        key="transactional"
        settingsKey="email.transactional"
        title="Sign-in & security"
        helper="Sign-in links, receipts, and security alerts — always sent."
        control={
          <span className="text-sm font-medium text-muted">Always on</span>
        }
      />,
    );
  }

  if (shouldShowSettingsRow("email.productUpdates")) {
    rows.push(
      <SettingsRow
        key="product"
        settingsKey="email.productUpdates"
        title="Product updates and newsletter"
        helper="Occasional news about Consciously."
        control={
          <SettingsSwitch
            aria-label="Product updates and newsletter"
            checked={settings.email.productUpdates}
            disabled={settingsRowDisabled("email.productUpdates")}
            onCheckedChange={
              settingsRowDisabled("email.productUpdates")
                ? undefined
                : (v) => onPatch({ email: { productUpdates: v } })
            }
          />
        }
      />,
    );
  }

  if (shouldShowSettingsRow("email.weeklySummary")) {
    rows.push(
      <SettingsRow
        key="weekly"
        settingsKey="email.weeklySummary"
        title="Weekly summary"
        helper="Meditations, focus time, and goal progress in one email."
        control={
          <SettingsSwitch
            aria-label="Weekly summary"
            checked={settings.email.weeklySummary}
            disabled={settingsRowDisabled("email.weeklySummary")}
            onCheckedChange={
              settingsRowDisabled("email.weeklySummary")
                ? undefined
                : (v) => onPatch({ email: { weeklySummary: v } })
            }
          />
        }
      />,
    );
  }

  if (shouldShowSettingsRow("email.communityReplies")) {
    rows.push(
      <SettingsRow
        key="community"
        settingsKey="email.communityReplies"
        title="Community replies and mentions"
        helper="When someone replies to you in Connect."
        control={
          <SettingsSwitch
            aria-label="Community replies and mentions"
            checked={settings.email.communityReplies}
            disabled={settingsRowDisabled("email.communityReplies")}
            onCheckedChange={
              settingsRowDisabled("email.communityReplies")
                ? undefined
                : (v) => onPatch({ email: { communityReplies: v } })
            }
          />
        }
      />,
    );
  }

  if (!rows.length) return null;

  return (
    <>
      <SettingsCard>{rows}</SettingsCard>
      <p className="text-xs text-muted">
        Every email has a one-click unsubscribe that updates these settings.
      </p>
    </>
  );
}

function MeditateSection({ settings, onPatch }: SectionProps) {
  const lengthOptions = [2, 5, 10, 20].map((m) => ({
    value: String(m),
    label: `${m} min`,
  }));
  const typeOptions: { value: MeditateType; label: string }[] = [
    { value: "guided", label: "Guided" },
    { value: "breathing", label: "Breathing" },
    { value: "body-scan", label: "Body scan" },
    { value: "sleep", label: "Sleep" },
  ];

  const [voiceDraft, setVoiceDraft] = useState(
    settings.meditate.defaultVoiceId ?? "",
  );

  useEffect(() => {
    setVoiceDraft(settings.meditate.defaultVoiceId ?? "");
  }, [settings.meditate.defaultVoiceId]);

  useDebouncedCommit(voiceDraft, (v) => {
    const trimmed = v.trim();
    onPatch({
      meditate: { defaultVoiceId: trimmed ? trimmed : null },
    });
  });

  const rows: ReactNode[] = [];

  if (shouldShowSettingsRow("meditate.defaults")) {
    rows.push(
      <SettingsRow
        key="length"
        settingsKey="meditate.defaults"
        title="Default length"
        helper="Starting duration when you open Create."
        control={
          <SettingsSegmented
            aria-label="Default meditation length"
            value={String(settings.meditate.defaultLengthMinutes)}
            options={lengthOptions}
            onChange={(v) =>
              onPatch({
                meditate: { defaultLengthMinutes: Number(v) },
              })
            }
          />
        }
      />,
    );
    rows.push(
      <SettingsRow
        key="type"
        settingsKey="meditate.defaults"
        title="Default type"
        helper="Guided, breathing, body scan, or sleep."
        showMarker={false}
        control={
          <SettingsSegmented
            aria-label="Default meditation type"
            value={settings.meditate.defaultType}
            options={typeOptions}
            onChange={(v) => onPatch({ meditate: { defaultType: v } })}
          />
        }
      />,
    );
    rows.push(
      <SettingsRow
        key="voice"
        settingsKey="meditate.defaults"
        title="Default voice"
        helper="The voice used when you create a new meditation. Leave blank to choose each time."
        showMarker={false}
        control={
          <input
            type="text"
            value={voiceDraft}
            onChange={(e) => setVoiceDraft(e.target.value)}
            placeholder="Choose when creating"
            className="w-[220px] max-w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            aria-label="Default voice"
          />
        }
      />,
    );
  }

  if (shouldShowSettingsRow("meditate.background")) {
    rows.push(
      <SettingsRow
        key="bg"
        settingsKey="meditate.background"
        title="Background sound"
        helper="Play ambient audio during meditations."
        control={
          <SettingsSwitch
            aria-label="Background sound"
            checked={settings.meditate.backgroundSound}
            disabled={settingsRowDisabled("meditate.background")}
            onCheckedChange={
              settingsRowDisabled("meditate.background")
                ? undefined
                : (v) => onPatch({ meditate: { backgroundSound: v } })
            }
          />
        }
      />,
    );
  }

  if (shouldShowSettingsRow("meditate.playbackSpeed")) {
    rows.push(
      <SettingsRow
        key="speed"
        settingsKey="meditate.playbackSpeed"
        title="Playback speed"
        helper="Faster or slower playback in the player."
        control={
          <SettingsSegmented
            aria-label="Playback speed"
            value={String(settings.meditate.playbackSpeed)}
            options={[
              { value: "0.75", label: "0.75×" },
              { value: "1", label: "1×" },
              { value: "1.25", label: "1.25×" },
            ]}
            disabled={settingsRowDisabled("meditate.playbackSpeed")}
            onChange={
              settingsRowDisabled("meditate.playbackSpeed")
                ? undefined
                : (v) =>
                    onPatch({
                      meditate: { playbackSpeed: Number(v) },
                    })
            }
          />
        }
      />,
    );
  }

  if (shouldShowSettingsRow("meditate.downloads")) {
    rows.push(
      <SettingsRow
        key="downloads"
        settingsKey="meditate.downloads"
        title="Downloads / offline"
        helper="Save meditations for offline listening."
        control={
          <SettingsSwitch
            aria-label="Offline downloads"
            checked={false}
            disabled
          />
        }
      />,
    );
  }

  if (!rows.length) return null;

  return (
    <>
      <SettingsCard>{rows}</SettingsCard>
    </>
  );
}

function FocusSection({ settings, onPatch }: SectionProps) {
  const sessionOptions = [15, 25, 50].map((m) => ({
    value: String(m),
    label: `${m} min`,
  }));
  const breakOptions = [5, 10, 15].map((m) => ({
    value: String(m),
    label: `${m} min break`,
  }));

  const rows: ReactNode[] = [];

  if (shouldShowSettingsRow("focus.sessionDefaults")) {
    rows.push(
      <SettingsRow
        key="session"
        settingsKey="focus.sessionDefaults"
        title="Default session length"
        helper="Starting focus timer when you open Focus."
        control={
          <SettingsSegmented
            aria-label="Default focus session length"
            value={String(settings.focus.defaultSessionMinutes)}
            options={sessionOptions}
            onChange={(v) =>
              onPatch({ focus: { defaultSessionMinutes: Number(v) } })
            }
          />
        }
      />,
    );
    rows.push(
      <SettingsRow
        key="break"
        settingsKey="focus.sessionDefaults"
        title="Break length"
        helper="Short break after each focus block."
        showMarker={false}
        control={
          <SettingsSegmented
            aria-label="Default break length"
            value={String(settings.focus.breakMinutes)}
            options={breakOptions}
            onChange={(v) =>
              onPatch({ focus: { breakMinutes: Number(v) } })
            }
          />
        }
      />,
    );
  }

  if (shouldShowSettingsRow("focus.distraction")) {
    rows.push(
      <SettingsRow
        key="distraction"
        settingsKey="focus.distraction"
        title="Distraction blocking"
        helper="Gentle nudge when you leave the timer."
        control={
          <SettingsSwitch
            aria-label="Distraction blocking"
            checked={settings.focus.distractionBlocking}
            disabled={settingsRowDisabled("focus.distraction")}
            onCheckedChange={
              settingsRowDisabled("focus.distraction")
                ? undefined
                : (v) => onPatch({ focus: { distractionBlocking: v } })
            }
          />
        }
      />,
    );
  }

  if (shouldShowSettingsRow("focus.goalsPicker")) {
    rows.push(
      <SettingsRow
        key="goals"
        settingsKey="focus.goalsPicker"
        title="Goals in the picker"
        helper="Which goals show when you start a focus session."
        control={
          <button
            type="button"
            disabled={settingsRowDisabled("focus.goalsPicker")}
            className="rounded-full border border-border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          >
            Choose…
          </button>
        }
      />,
    );
  }

  if (!rows.length) return null;

  return (
    <>
      <SettingsCard>{rows}</SettingsCard>
    </>
  );
}

function GeneralSection({ settings, onPatch }: SectionProps) {
  const detectedTz =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "UTC";
  const { plan } = getSessionPrivileges();
  const planLabel =
    plan === "pro" ? "Pro" : plan === "create" ? "Create" : "Free";

  const themeOptions = COLOR_SCHEME_OPTIONS.map((o) => ({
    value: o.id as ThemePreference,
    label: o.label,
  }));

  const version =
    (import.meta.env.VITE_APP_VERSION as string | undefined)?.trim() ||
    "0.1.0";

  const rows: ReactNode[] = [];
  const a11yRows: ReactNode[] = [];

  if (shouldShowSettingsRow("general.theme")) {
    const themeValue: ThemePreference =
      settings.general.theme === "dark" ? "dark" : "light";
    rows.push(
      <SettingsRow
        key="theme"
        settingsKey="general.theme"
        title="Theme"
        helper="Light or dark on this device."
        control={
          <SettingsSegmented
            aria-label="Theme"
            value={themeValue}
            options={themeOptions}
            onChange={(v) => {
              setColorScheme(v);
              onPatch({ general: { theme: v } });
            }}
          />
        }
      />,
    );
  }

  if (shouldShowSettingsRow("general.language")) {
    rows.push(
      <SettingsRow
        key="language"
        settingsKey="general.language"
        title="Language"
        helper="Language for menus and messages."
        control={
          <span className="text-sm text-muted">{settings.general.language}</span>
        }
      />,
    );
  }

  if (shouldShowSettingsRow("general.timeZone")) {
    rows.push(
      <SettingsRow
        key="tz"
        settingsKey="general.timeZone"
        title="Time zone"
        helper={`Used for reminders and summaries. Right now: ${detectedTz}.`}
        control={
          <span className="max-w-[200px] truncate text-sm text-foreground">
            {settings.general.timeZone?.trim() || detectedTz}
          </span>
        }
      />,
    );
  }

  if (shouldShowSettingsRow("general.textSize")) {
    a11yRows.push(
      <SettingsRow
        key="textSize"
        settingsKey="general.textSize"
        title="Text size"
        helper="Larger text across the app."
        control={
          <SettingsSegmented
            aria-label="Text size"
            value={settings.general.textSize}
            options={[
              { value: "default", label: "Default" },
              { value: "large", label: "Large" },
            ]}
            disabled={settingsRowDisabled("general.textSize")}
            onChange={
              settingsRowDisabled("general.textSize")
                ? undefined
                : (v) => onPatch({ general: { textSize: v } })
            }
          />
        }
      />,
    );
  }

  if (shouldShowSettingsRow("general.reducedMotion")) {
    a11yRows.push(
      <SettingsRow
        key="motion"
        settingsKey="general.reducedMotion"
        title="Reduced motion"
        helper="Use less animation. System follows your device setting."
        control={
          <SettingsSegmented
            aria-label="Reduced motion"
            value={settings.general.reducedMotion}
            options={[
              { value: "system", label: "System" },
              { value: "reduce", label: "Reduce" },
              { value: "no-preference", label: "Full" },
            ]}
            disabled={settingsRowDisabled("general.reducedMotion")}
            onChange={
              settingsRowDisabled("general.reducedMotion")
                ? undefined
                : (v) => onPatch({ general: { reducedMotion: v } })
            }
          />
        }
      />,
    );
  }

  if (shouldShowSettingsRow("general.captions")) {
    a11yRows.push(
      <SettingsRow
        key="captions"
        settingsKey="general.captions"
        title="Captions for audio"
        helper="Show text while you listen to guided audio."
        control={
          <SettingsSwitch
            aria-label="Captions for audio"
            checked={settings.general.captions}
            disabled={settingsRowDisabled("general.captions")}
            onCheckedChange={
              settingsRowDisabled("general.captions")
                ? undefined
                : (v) => onPatch({ general: { captions: v } })
            }
          />
        }
      />,
    );
  }

  const billingRows: ReactNode[] = [];
  if (shouldShowSettingsRow("general.billing")) {
    billingRows.push(
      <SettingsRow
        key="billing"
        settingsKey="general.billing"
        title="Subscription"
        helper="Your current plan and billing details."
        control={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="text-sm font-medium text-foreground">
              {planLabel}
            </span>
            <Link
              to="/pricing"
              className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:border-accent/40"
            >
              Manage
            </Link>
          </div>
        }
      />,
    );
  }

  const helpRows: ReactNode[] = [];
  if (shouldShowSettingsRow("general.help")) {
    helpRows.push(
      <SettingsRow
        key="help"
        settingsKey="general.help"
        title="Help & feedback"
        helper="Questions, bugs, or ideas — we read every message."
        control={
          <a
            href="mailto:hello@consciously.live"
            className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:border-accent/40"
          >
            Email us
          </a>
        }
      />,
    );
  }
  if (shouldShowSettingsRow("general.version")) {
    helpRows.push(
      <SettingsRow
        key="version"
        settingsKey="general.version"
        title="App version"
        helper="Share this if you contact support about a problem."
        control={
          <span className="font-mono text-sm text-muted">{version}</span>
        }
      />,
    );
  }

  const any =
    rows.length ||
    a11yRows.length ||
    billingRows.length ||
    helpRows.length;
  if (!any) return null;

  return (
    <>
      {rows.length ? <SettingsCard>{rows}</SettingsCard> : null}
      {a11yRows.length ? (
        <SettingsCard>{a11yRows}</SettingsCard>
      ) : null}
      {billingRows.length ? (
        <SettingsCard>{billingRows}</SettingsCard>
      ) : null}
      {helpRows.length ? (
        <SettingsCard id="settings-help">{helpRows}</SettingsCard>
      ) : null}
    </>
  );
}

export function SettingsSectionContent({
  section,
  settings,
  onPatch,
}: {
  section: SettingsSectionId;
  settings: UserSettingsV1;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const props = { settings, onPatch };
  switch (section) {
    case "account":
      return <AccountSection {...props} />;
    case "ai":
      return <AiSection {...props} />;
    case "privacy":
      return <PrivacySection {...props} />;
    case "notifications":
      return <NotificationsSection {...props} />;
    case "email":
      return <EmailSection {...props} />;
    case "meditate":
      return <MeditateSection {...props} />;
    case "focus":
      return <FocusSection {...props} />;
    case "general":
      return <GeneralSection {...props} />;
    default:
      return null;
  }
}

export const SETTINGS_NAV: ReadonlyArray<{
  id: SettingsSectionId;
  label: string;
}> = [
  { id: "account", label: "Account" },
  { id: "ai", label: "AI & data" },
  { id: "privacy", label: "Privacy" },
  { id: "notifications", label: "Notifications" },
  { id: "email", label: "Email" },
  { id: "meditate", label: "Meditate" },
  { id: "focus", label: "Focus" },
  { id: "general", label: "General" },
];
