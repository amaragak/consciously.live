"use client";

import { useEffect, useState } from "react";
import {
  fetchUsernameProfile,
  patchMeditationShare,
  saveUsername,
  type LibraryMeditationItem,
  type ListenShareSnapshot,
} from "@/lib/medimade-api";
import {
  getMedimadeSessionDisplayName,
  getMedimadeSessionEmail,
} from "@/lib/auth-session";
import { firstNameFromAccount } from "@/lib/manifesto-print";
import { parseMeditationCreationProvenance } from "@/lib/meditation-creation-provenance";
import { marketingHref } from "@/lib/origins";
import { formatDuration } from "@/components/library-meditation-card";

function briefFromItem(item: LibraryMeditationItem): string | null {
  const p = parseMeditationCreationProvenance(item.creationProvenance);
  if (!p) return null;
  if (p.directPrompt?.trim()) return p.directPrompt.trim().slice(0, 400);
  if (p.messages?.length) {
    for (let i = p.messages.length - 1; i >= 0; i -= 1) {
      const m = p.messages[i];
      if (m?.role === "user" && m.text?.trim()) {
        return m.text.trim().slice(0, 400);
      }
    }
  }
  if (p.journalGuidance?.trim()) return p.journalGuidance.trim().slice(0, 400);
  if (p.manifest) {
    const bits = [
      p.manifest.lifeAreaTitle,
      p.manifest.focusGoalTitle,
      p.manifest.obstacleText,
      p.manifest.guidance,
    ].filter((x): x is string => typeof x === "string" && Boolean(x.trim()));
    if (bits.length) return bits.join(" — ").slice(0, 400);
  }
  if (p.styleQuestionAnswers?.length) {
    return p.styleQuestionAnswers.filter(Boolean).join(" · ").slice(0, 400);
  }
  return null;
}

function styleLine(item: LibraryMeditationItem): string {
  const style =
    (item.meditationStyle && item.meditationStyle.trim()) ||
    (item.meditationType && item.meditationType.trim()) ||
    "";
  const dur = formatDuration(item.durationSeconds);
  return [style, dur].filter(Boolean).join(" · ");
}

export function ListenShareSheet({
  open,
  item,
  kind = "meditation",
  onClose,
  onShared,
}: {
  open: boolean;
  item: LibraryMeditationItem;
  kind?: "meditation" | "story";
  onClose: () => void;
  onShared: (next: {
    listenSlug: string | null;
    shareToken: string | null;
    listenShare: ListenShareSnapshot | null;
  }) => void;
}) {
  const existing = item.listenShare ?? null;
  const alreadyShared = Boolean(item.listenSlug && existing);

  const [mode, setMode] = useState<"form" | "shared">(
    alreadyShared ? "shared" : "form",
  );
  const [title, setTitle] = useState(existing?.title || item.title || "");
  const [description, setDescription] = useState(
    existing?.description || item.description || "",
  );
  const [shownAs, setShownAs] = useState(
    existing?.shownAs ??
      firstNameFromAccount(
        getMedimadeSessionDisplayName(),
        getMedimadeSessionEmail(),
      ),
  );
  const [showBrief, setShowBrief] = useState(existing?.showBrief === true);
  const [listed, setListed] = useState(
    kind === "story" ? false : existing?.listed === true,
  );
  const brief = existing?.brief || briefFromItem(item);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [needsUsername, setNeedsUsername] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [usernameHelper, setUsernameHelper] = useState(
    "Your public links use this: consciously.live/listen/<username>. You can change it in Settings.",
  );
  const [wasListed, setWasListed] = useState(false);

  useEffect(() => {
    if (!open) return;
    const share = item.listenShare ?? null;
    const shared = Boolean(item.listenSlug && share);
    setMode(shared ? "shared" : "form");
    setTitle(share?.title || item.title || "");
    setDescription(share?.description || item.description || "");
    setShownAs(
      share?.shownAs ??
        firstNameFromAccount(
          getMedimadeSessionDisplayName(),
          getMedimadeSessionEmail(),
        ),
    );
    setShowBrief(share?.showBrief === true);
    setListed(kind === "story" ? false : share?.listed === true);
    setWasListed(share?.listed === true);
    setShareUrl(
      item.listenSlug
        ? marketingHref(`/listen/${encodeURIComponent(item.listenSlug)}`)
        : null,
    );
    setError(null);
    setCopied(false);
    void fetchUsernameProfile()
      .then((p) => {
        setNeedsUsername(!p.chosen);
        setUsernameDraft(p.prefill || "");
        setUsernameHelper(p.helper);
      })
      .catch(() => {
        setNeedsUsername(true);
      });
  }, [open, item, kind]);

  if (!open) return null;

  async function createOrUpdate(action: "create" | "update") {
    if (!item.sk) return;
    setBusy(true);
    setError(null);
    try {
      if (needsUsername) {
        const trimmed = usernameDraft.trim().toLowerCase();
        if (!trimmed) {
          setError("Choose a username before sharing");
          setBusy(false);
          return;
        }
        await saveUsername(trimmed);
        setNeedsUsername(false);
      }
      const asHouse =
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("as") === "consciously";
      const result = await patchMeditationShare({
        sk: item.sk,
        action,
        kind,
        title: title.trim(),
        description: description.trim(),
        shownAs: asHouse ? "Consciously" : shownAs.trim(),
        showBrief: kind === "meditation" ? showBrief : false,
        brief,
        listed: kind === "story" && !asHouse ? false : listed,
        asHouse: asHouse || undefined,
      });
      setShareUrl(
        result.url ||
          (result.slug
            ? marketingHref(`/listen/${encodeURIComponent(result.slug)}`)
            : null),
      );
      onShared({
        listenSlug: result.slug,
        shareToken: result.shareToken,
        listenShare: result.listenShare,
      });
      setMode("shared");
      if (
        action === "create" &&
        result.url &&
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        /Mobi|Android/i.test(navigator.userAgent)
      ) {
        try {
          await navigator.share({ title: title.trim(), url: result.url });
        } catch {
          /* user cancelled */
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not share";
      if (/username/i.test(msg)) setNeedsUsername(true);
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function stopSharing() {
    if (!item.sk) return;
    setBusy(true);
    setError(null);
    try {
      const asHouse =
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("as") === "consciously";
      await patchMeditationShare({
        sk: item.sk,
        action: "revoke",
        asHouse: asHouse || undefined,
      });
      onShared({ listenSlug: null, shareToken: null, listenShare: null });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not stop sharing");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", shareUrl);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[220] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="listen-share-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-[var(--surface,#fff)] shadow-2xl sm:rounded-2xl">
        <div className="flex items-start gap-3 border-b border-[var(--border)] px-5 py-4">
          {item.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.coverImageUrl}
              alt=""
              className="size-12 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <div className="size-12 shrink-0 rounded-lg bg-[var(--surface-2,#f3efe6)]" />
          )}
          <div className="min-w-0 flex-1">
            <h2
              id="listen-share-title"
              className="m-0 text-[16px] font-semibold text-foreground"
            >
              {kind === "story"
                ? "Share your Story"
                : "Share this meditation"}
            </h2>
            <p className="m-0 mt-0.5 text-[13px] text-muted">{styleLine(item)}</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            className="text-muted hover:text-foreground"
            onClick={onClose}
            disabled={busy}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {mode === "form" ? (
          <div className="flex flex-col gap-4 px-5 py-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-foreground">Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="rounded-xl border border-[var(--border)] bg-transparent px-3 py-2.5 text-[15px] outline-none focus:border-[var(--header-gold,#d9b87c)]"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-foreground">
                Description
              </span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="resize-none rounded-xl border border-[var(--border)] bg-transparent px-3 py-2.5 text-[15px] outline-none focus:border-[var(--header-gold,#d9b87c)]"
              />
              <span className="text-[12.5px] text-muted">
                Written from what you told Consciously. Check it doesn’t say more
                than you want to share.
              </span>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-foreground">
                Shown as
              </span>
              <input
                value={shownAs}
                onChange={(e) => setShownAs(e.target.value)}
                className="rounded-xl border border-[var(--border)] bg-transparent px-3 py-2.5 text-[15px] outline-none focus:border-[var(--header-gold,#d9b87c)]"
              />
              <span className="text-[12.5px] text-muted">
                Your first name by default. Leave it blank to share without a
                name.
              </span>
            </label>

            {needsUsername ? (
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-foreground">
                  Username
                </span>
                <input
                  value={usernameDraft}
                  onChange={(e) =>
                    setUsernameDraft(
                      e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                    )
                  }
                  autoComplete="username"
                  spellCheck={false}
                  className="rounded-xl border border-[var(--border)] bg-transparent px-3 py-2.5 text-[15px] outline-none focus:border-[var(--header-gold,#d9b87c)]"
                />
                <span className="text-[12.5px] text-muted">{usernameHelper}</span>
              </label>
            ) : null}

            {kind === "meditation" ? (
              <div className="rounded-xl border border-[var(--border)] px-3.5 py-3">
                <label className="flex items-start justify-between gap-3">
                  <span className="text-[14px] font-medium text-foreground">
                    Show the line it was made from
                  </span>
                  <input
                    type="checkbox"
                    checked={showBrief}
                    onChange={(e) => setShowBrief(e.target.checked)}
                    className="mt-1"
                  />
                </label>
                {brief ? (
                  <p className="m-0 mt-2 text-[13.5px] leading-snug text-muted">
                    “{brief}”
                  </p>
                ) : (
                  <p className="m-0 mt-2 text-[13px] text-muted">
                    No brief stored for this meditation.
                  </p>
                )}
              </div>
            ) : null}

            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="mb-1 text-[13px] font-medium text-foreground">
                Who can listen
              </legend>
              <label
                className={`flex cursor-pointer gap-3 rounded-xl border px-3.5 py-3 ${
                  !listed
                    ? "border-[var(--header-gold,#d9b87c)] bg-[color-mix(in_srgb,var(--header-gold,#d9b87c)_10%,transparent)]"
                    : "border-[var(--border)]"
                }`}
              >
                <input
                  type="radio"
                  name="listen-who"
                  checked={!listed}
                  onChange={() => setListed(false)}
                  className="mt-1"
                />
                <span>
                  <span className="block text-[14px] font-semibold text-foreground">
                    Anyone with the link
                  </span>
                  <span className="mt-0.5 block text-[13px] text-muted">
                    Not listed anywhere. Only people you send it to can listen.
                  </span>
                </span>
              </label>
              <label
                className={`flex gap-3 rounded-xl border px-3.5 py-3 ${
                  kind === "story"
                    ? "cursor-not-allowed opacity-55"
                    : "cursor-pointer"
                } ${
                  listed && kind !== "story"
                    ? "border-[var(--header-gold,#d9b87c)] bg-[color-mix(in_srgb,var(--header-gold,#d9b87c)_10%,transparent)]"
                    : "border-[var(--border)]"
                }`}
              >
                <input
                  type="radio"
                  name="listen-who"
                  checked={listed}
                  disabled={kind === "story"}
                  onChange={() => setListed(true)}
                  className="mt-1"
                />
                <span>
                  <span className="block text-[14px] font-semibold text-foreground">
                    Anyone with the link, and listed in Listen
                  </span>
                  <span className="mt-0.5 block text-[13px] text-muted">
                    {kind === "story"
                      ? "Stories are about you, so they can only be shared by link."
                      : "Also shown on consciously.live/listen for anyone to find."}
                  </span>
                </span>
              </label>
            </fieldset>

            {wasListed && !listed ? (
              <p className="m-0 text-[13px] leading-snug text-[#9B3B2E]">
                Your old link will stop working.
              </p>
            ) : null}

            {error ? (
              <p className="m-0 text-[13px] text-[#9B3B2E]" role="alert">
                {error}
              </p>
            ) : null}

            <button
              type="button"
              disabled={
                busy ||
                !title.trim() ||
                !item.sk ||
                (needsUsername && !usernameDraft.trim())
              }
              onClick={() =>
                void createOrUpdate(alreadyShared ? "update" : "create")
              }
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#AFC2DC] bg-[#C3D2E8] px-5 text-[15px] font-semibold text-[#14203A] disabled:opacity-50"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              {busy
                ? "Saving…"
                : alreadyShared
                  ? "Save changes"
                  : "Create link"}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 px-5 py-4">
            <p className="m-0 text-[14px] font-medium text-foreground">
              Shared ·{" "}
              {listed
                ? "anyone with the link, and listed in Listen"
                : "anyone with the link"}
            </p>
            <div className="flex gap-2">
              <input
                readOnly
                value={shareUrl ?? ""}
                className="min-w-0 flex-1 truncate rounded-xl border border-[var(--border)] bg-transparent px-3 py-2.5 text-[13.5px] text-foreground"
              />
              <button
                type="button"
                onClick={() => void copy()}
                className="inline-flex h-11 shrink-0 items-center rounded-full border border-[#AFC2DC] bg-[#C3D2E8] px-4 text-[14px] font-semibold text-[#14203A]"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <button
              type="button"
              className="text-left text-[14px] font-medium text-foreground underline-offset-2 hover:underline"
              onClick={() => setMode("form")}
              disabled={busy}
            >
              Edit details
            </button>
            <button
              type="button"
              className="text-left text-[14px] font-medium text-[#9B3B2E]"
              onClick={() => void stopSharing()}
              disabled={busy}
            >
              Stop sharing
            </button>
            <p className="m-0 text-[12.5px] leading-snug text-muted">
              Stop sharing turns the link off straight away. Anyone who opens it
              after that sees that it isn’t shared any more.
            </p>
            {error ? (
              <p className="m-0 text-[13px] text-[#9B3B2E]" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
