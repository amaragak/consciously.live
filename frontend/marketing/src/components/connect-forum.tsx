"use client";

import { useMemo, useState } from "react";
import { ConnectUserAvatar } from "@/components/connect-user-avatar";
import { scrollAppToTop } from "@/lib/scroll-app";

type CategoryId = "all" | "philosophy" | "journeys" | "inquiry";

type Comment = {
  id: string;
  author: string;
  body: string;
  postedAt: string;
  children: Comment[];
};

type Thread = {
  id: string;
  category: Exclude<CategoryId, "all">;
  title: string;
  excerpt: string;
  body: string;
  author: string;
  bumpedAt: string;
  likes: number;
  comments: Comment[];
};

const CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "philosophy", label: "Philosophy" },
  { id: "journeys", label: "Journeys" },
  { id: "inquiry", label: "Inquiry" },
];

function countComments(nodes: Comment[]): number {
  let n = 0;
  for (const c of nodes) {
    n += 1 + countComments(c.children);
  }
  return n;
}

/** Placeholder threads until the forum API exists. */
const DEMO_THREADS: Thread[] = [
  {
    id: "t1",
    category: "philosophy",
    title: "What does “enough” mean when the feed never ends?",
    excerpt:
      "I’ve been sitting with attention as a moral question, not only a productivity one…",
    body: "I’ve been sitting with attention as a moral question, not only a productivity one. When every app is designed to ask for more of me, “enough” feels almost radical — and I don’t always know how to practice it without becoming rigid or withdrawn.",
    author: "Alex",
    bumpedAt: "2h ago",
    likes: 24,
    comments: [
      {
        id: "t1c1",
        author: "Priya",
        body: "For me “enough” showed up as a body cue first — a slight tightness when I keep scrolling past the point of interest. Naming that moment (“this is past enough”) has been more useful than any rule about screen time.",
        postedAt: "1h ago",
        children: [
          {
            id: "t1c1a",
            author: "Alex",
            body: "Body cue first — yes. I’ve been treating it as a willpower problem and missing the signal entirely.",
            postedAt: "50m ago",
            children: [
              {
                id: "t1c1a1",
                author: "Priya",
                body: "Willpower was my first story too. Softening into the cue made “enough” feel kinder, not stricter.",
                postedAt: "35m ago",
                children: [],
              },
            ],
          },
        ],
      },
      {
        id: "t1c2",
        author: "Leo",
        body: "I try to treat attention like a finite gift I can give once a day to something that deserves it — a person, a page, a walk — and let the rest of the feed be weather I don’t have to stand in.",
        postedAt: "45m ago",
        children: [
          {
            id: "t1c2a",
            author: "Alex",
            body: "That framing of weather helps. I keep trying to win against the feed instead of just stepping out of the storm.",
            postedAt: "20m ago",
            children: [],
          },
        ],
      },
    ],
  },
  {
    id: "t2",
    category: "journeys",
    title: "A year of journaling without fixing myself",
    excerpt:
      "The practice stopped being about becoming someone else. Here’s what shifted…",
    body: "The practice stopped being about becoming someone else. For a long time every entry was a self-improvement plan in disguise. This year I wrote without a thesis — just what happened and how it felt — and something quieter started to grow.",
    author: "Maya",
    bumpedAt: "Yesterday",
    likes: 41,
    comments: [
      {
        id: "t2c1",
        author: "Chris",
        body: "Same shift here. When I dropped the “lessons learned” section, the pages got honest. Oddly, change showed up anyway — just not on my schedule.",
        postedAt: "18h ago",
        children: [
          {
            id: "t2c1a",
            author: "Maya",
            body: "Yes — the schedule was the problem. I was using the journal as a manager instead of a witness.",
            postedAt: "12h ago",
            children: [
              {
                id: "t2c1a1",
                author: "Chris",
                body: "Witness is the word. I’m stealing that.",
                postedAt: "10h ago",
                children: [],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "t3",
    category: "inquiry",
    title: "How do you stay kind when you’re angry at the world?",
    excerpt:
      "Looking for lived answers more than slogans — what actually helps in the moment?",
    body: "Looking for lived answers more than slogans. When the news or a conversation lights me up with anger, I don’t want to numb out — but I also don’t want to spill heat onto people who didn’t earn it. What actually helps in the moment for you?",
    author: "Jordan",
    bumpedAt: "3d ago",
    likes: 67,
    comments: [
      {
        id: "t3c1",
        author: "Noor",
        body: "A short walk with no podcast. Anger wants a story; motion without narrative gives it somewhere to go that isn’t another person.",
        postedAt: "2d ago",
        children: [],
      },
      {
        id: "t3c2",
        author: "Ellis",
        body: "I write the unkind version first in a note I’ll delete — then ask what the anger is protecting. Often it’s grief or fear. Kindness comes back easier once I’ve named that.",
        postedAt: "2d ago",
        children: [
          {
            id: "t3c2a",
            author: "Jordan",
            body: "Protecting grief — that lands. Thank you both.",
            postedAt: "1d ago",
            children: [
              {
                id: "t3c2a1",
                author: "Ellis",
                body: "Glad it helped. Grief disguised as fury is so easy to miss.",
                postedAt: "22h ago",
                children: [],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "t4",
    category: "philosophy",
    title: "Freedom vs. structure in a contemplative life",
    excerpt:
      "Rituals that free me vs. rules that shrink me — where do you draw the line?",
    body: "Rituals that free me vs. rules that shrink me — I’m trying to feel the difference in my body. Morning silence feels like freedom. A rigid checklist of “spiritual tasks” starts to feel like another performance. Where do you draw the line?",
    author: "Sam",
    bumpedAt: "5d ago",
    likes: 18,
    comments: [
      {
        id: "t4c1",
        author: "River",
        body: "I ask: does this structure return me to myself, or to an image of who I should be? The first is freedom wearing a schedule. The second is a costume.",
        postedAt: "4d ago",
        children: [
          {
            id: "t4c1a",
            author: "Sam",
            body: "“Costume” is exactly the word. I’m going to keep that question next to my morning list.",
            postedAt: "3d ago",
            children: [],
          },
        ],
      },
    ],
  },
];

const CATEGORY_LABEL: Record<Exclude<CategoryId, "all">, string> = {
  philosophy: "Philosophy",
  journeys: "Journeys",
  inquiry: "Inquiry",
};

const MAX_DEPTH = 6;

function CommentTree({
  comments,
  depth,
  replyToId,
  onReply,
  onCancelReply,
  draft,
  onDraftChange,
  onSubmitReply,
}: {
  comments: Comment[];
  depth: number;
  replyToId: string | null;
  onReply: (id: string) => void;
  onCancelReply: () => void;
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmitReply: () => void;
}) {
  if (comments.length === 0) return null;

  return (
    <ul className={depth === 0 ? "mt-2" : ""}>
      {comments.map((c) => {
        const isReplying = replyToId === c.id;
        return (
          <li key={c.id} className={depth === 0 ? "border-t border-border" : ""}>
            <div
              className={`py-4 ${
                depth > 0 ? "border-l-2 border-border/80 pl-3 sm:pl-4" : ""
              }`}
              style={
                depth > 0
                  ? { marginLeft: `${Math.min(depth, MAX_DEPTH) * 0.75}rem` }
                  : undefined
              }
            >
              <div className="flex items-center gap-2">
                <ConnectUserAvatar name={c.author} size="sm" showName />
                <span className="text-xs text-muted">· {c.postedAt}</span>
              </div>
              <p className="mt-2 text-[15px] leading-relaxed text-foreground">
                {c.body}
              </p>
              <button
                type="button"
                onClick={() => onReply(isReplying ? "" : c.id)}
                className="mt-2 text-xs font-semibold text-accent-link transition-opacity hover:opacity-80"
              >
                {isReplying ? "Cancel" : "Reply"}
              </button>

              {isReplying ? (
                <div className="mt-3 space-y-2">
                  <textarea
                    rows={3}
                    value={draft}
                    onChange={(e) => onDraftChange(e.target.value)}
                    placeholder={`Reply to ${c.author}…`}
                    className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-relaxed text-foreground outline-none ring-accent/25 focus:ring-2"
                    autoFocus
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={!draft.trim()}
                      onClick={onSubmitReply}
                      className="rounded-full accent-fill-gradient px-4 py-1.5 text-xs font-semibold text-on-accent disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Reply (preview)
                    </button>
                    <button
                      type="button"
                      onClick={onCancelReply}
                      className="text-xs font-medium text-muted hover:text-foreground"
                    >
                      Cancel
                    </button>
                    <span className="text-[11px] text-muted">
                      Local preview only — not saved yet.
                    </span>
                  </div>
                </div>
              ) : null}
            </div>

            {c.children.length > 0 ? (
              <CommentTree
                comments={c.children}
                depth={depth + 1}
                replyToId={replyToId}
                onReply={onReply}
                onCancelReply={onCancelReply}
                draft={draft}
                onDraftChange={onDraftChange}
                onSubmitReply={onSubmitReply}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function insertReply(
  nodes: Comment[],
  parentId: string,
  reply: Comment,
): Comment[] {
  return nodes.map((n) => {
    if (n.id === parentId) {
      return { ...n, children: [...n.children, reply] };
    }
    if (n.children.length === 0) return n;
    return {
      ...n,
      children: insertReply(n.children, parentId, reply),
    };
  });
}

function StatsRow({
  comments,
  likes,
  liked,
  onToggleLike,
}: {
  comments: number;
  likes: number;
  liked?: boolean;
  onToggleLike?: () => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted">
      <span>
        {comments} {comments === 1 ? "comment" : "comments"}
      </span>
      {onToggleLike ? (
        <button
          type="button"
          onClick={onToggleLike}
          className={`font-medium transition-colors ${
            liked ? "text-accent-link" : "text-muted hover:text-foreground"
          }`}
        >
          {liked ? "♥" : "♡"} {likes}
        </button>
      ) : (
        <span>
          ♡ {likes} {likes === 1 ? "like" : "likes"}
        </span>
      )}
    </div>
  );
}

/**
 * Signed-in Connect forum scaffold (Next marketing app — no SPA handoff).
 * Demo data only; wire to API later.
 */
export function ConnectForum() {
  const [category, setCategory] = useState<CategoryId>("all");
  const [threads, setThreads] = useState(DEMO_THREADS);
  const [selectedId, setSelectedId] = useState<string | null>(
    DEMO_THREADS[0]?.id ?? null,
  );
  const [detailOpen, setDetailOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [threadReplyDraft, setThreadReplyDraft] = useState("");
  const [likedIds, setLikedIds] = useState<Set<string>>(() => new Set());

  const filtered = useMemo(
    () =>
      category === "all"
        ? threads
        : threads.filter((t) => t.category === category),
    [category, threads],
  );

  const selected =
    filtered.find((t) => t.id === selectedId) ?? filtered[0] ?? null;

  function toggleLike(threadId: string) {
    setLikedIds((prev) => {
      const next = new Set(prev);
      const wasLiked = next.has(threadId);
      if (wasLiked) next.delete(threadId);
      else next.add(threadId);
      setThreads((threadsPrev) =>
        threadsPrev.map((t) =>
          t.id === threadId
            ? { ...t, likes: Math.max(0, t.likes + (wasLiked ? -1 : 1)) }
            : t,
        ),
      );
      return next;
    });
  }

  function openDetail(threadId: string) {
    setSelectedId(threadId);
    setDetailOpen(true);
    setReplyToId(null);
    setReplyDraft("");
    setThreadReplyDraft("");
    scrollAppToTop("auto");
  }

  function closeDetail() {
    setDetailOpen(false);
    setReplyToId(null);
    setReplyDraft("");
    setThreadReplyDraft("");
    scrollAppToTop("auto");
  }

  function submitNestedReply() {
    if (!selected || !replyToId || !replyDraft.trim()) return;
    const reply: Comment = {
      id: `local-${Date.now()}`,
      author: "You",
      body: replyDraft.trim(),
      postedAt: "Just now",
      children: [],
    };
    setThreads((prev) =>
      prev.map((t) =>
        t.id === selected.id
          ? { ...t, comments: insertReply(t.comments, replyToId, reply) }
          : t,
      ),
    );
    setReplyDraft("");
    setReplyToId(null);
  }

  function submitThreadReply() {
    if (!selected || !threadReplyDraft.trim()) return;
    const reply: Comment = {
      id: `local-${Date.now()}`,
      author: "You",
      body: threadReplyDraft.trim(),
      postedAt: "Just now",
      children: [],
    };
    setThreads((prev) =>
      prev.map((t) =>
        t.id === selected.id
          ? { ...t, comments: [...t.comments, reply] }
          : t,
      ),
    );
    setThreadReplyDraft("");
  }

  /* —— Full-width thread + replies —— */
  if (detailOpen && selected) {
    const commentCount = countComments(selected.comments);
    const liked = likedIds.has(selected.id);

    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <button
          type="button"
          onClick={closeDetail}
          className="text-sm font-medium text-muted transition-colors hover:text-foreground"
        >
          ← Back to Connect
        </button>

        <p className="mt-8 text-[11px] font-semibold uppercase tracking-wide text-accent-link">
          {CATEGORY_LABEL[selected.category]}
        </p>
        <h1 className="mt-2 font-display text-3xl font-medium tracking-tight text-foreground sm:text-4xl md:text-[2.75rem]">
          {selected.title}
        </h1>
        <div className="mt-2 flex items-center gap-2">
          <ConnectUserAvatar name={selected.author} size="sm" showName />
          <span className="text-xs text-muted">· {selected.bumpedAt}</span>
        </div>

        <article className="mt-6 border-b border-border pb-6">
          <p className="text-[15px] leading-relaxed text-foreground sm:text-lg">
            {selected.body}
          </p>
          <StatsRow
            comments={commentCount}
            likes={selected.likes}
            liked={liked}
            onToggleLike={() => toggleLike(selected.id)}
          />
        </article>

        <div className="mt-6">
          <label className="block text-xs font-medium text-muted">
            Reply to thread
          </label>
          <textarea
            rows={3}
            value={threadReplyDraft}
            onChange={(e) => setThreadReplyDraft(e.target.value)}
            placeholder="Add a top-level reply…"
            className="mt-1.5 w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-accent/25 focus:ring-2"
          />
          <button
            type="button"
            disabled={!threadReplyDraft.trim()}
            onClick={submitThreadReply}
            className="mt-2 rounded-full accent-fill-gradient px-4 py-1.5 text-sm font-semibold text-on-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reply (preview)
          </button>
        </div>

        <h2 className="mt-8 font-display text-lg font-medium tracking-tight text-foreground">
          Comments
        </h2>

        <CommentTree
          comments={selected.comments}
          depth={0}
          replyToId={replyToId}
          onReply={(id) => {
            setReplyToId(id || null);
            setReplyDraft("");
          }}
          onCancelReply={() => {
            setReplyToId(null);
            setReplyDraft("");
          }}
          draft={replyDraft}
          onDraftChange={setReplyDraft}
          onSubmitReply={submitNestedReply}
        />
      </div>
    );
  }

  /* —— List + preview (body + stats only) —— */
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
            <span className="text-foreground">consciously</span>{" "}
            <span className="italic text-accent-link">Connect</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
            Philosophy, personal journeys, and open questions — a slower forum.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setComposerOpen((o) => !o)}
          className="inline-flex shrink-0 items-center justify-center rounded-full accent-fill-gradient px-5 py-2.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90"
        >
          {composerOpen ? "Cancel" : "New thread"}
        </button>
      </header>

      {composerOpen ? (
        <form
          className="mt-8 space-y-3 border-t border-border pt-6"
          onSubmit={(e) => {
            e.preventDefault();
            setComposerOpen(false);
            setDraftTitle("");
            setDraftBody("");
          }}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            New thread (preview)
          </p>
          <input
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            placeholder="Title"
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-accent/25 focus:ring-2"
          />
          <textarea
            value={draftBody}
            onChange={(e) => setDraftBody(e.target.value)}
            placeholder="Share the question or the chapter you’re in…"
            rows={5}
            className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-relaxed text-foreground outline-none ring-accent/25 focus:ring-2"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={!draftTitle.trim() || !draftBody.trim()}
              className="rounded-full accent-fill-gradient px-5 py-2 text-sm font-semibold text-on-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              Post (soon)
            </button>
            <span className="text-xs text-muted">
              Saving isn’t wired yet — layout only.
            </span>
          </div>
        </form>
      ) : null}

      <nav
        className="mt-8 flex flex-wrap gap-1.5"
        aria-label="Forum categories"
      >
        {CATEGORIES.map((c) => {
          const active = category === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setCategory(c.id);
                setSelectedId(null);
              }}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-selected text-on-selected"
                  : "bg-accent-soft/40 text-muted hover:text-foreground"
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </nav>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-12">
        <ul className="divide-y divide-border border-t border-border">
          {filtered.length === 0 ? (
            <li className="py-8 text-sm text-muted">
              No threads in this category yet.
            </li>
          ) : (
            filtered.map((t) => {
              const active = selected?.id === t.id;
              const replyCount = countComments(t.comments);
              return (
                <li key={t.id}>
                  <div
                    className={`flex flex-col gap-1 py-4 transition-colors ${
                      active ? "opacity-100" : "opacity-80 hover:opacity-100"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className="flex w-full flex-col gap-1 text-left"
                    >
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-accent-link">
                        {CATEGORY_LABEL[t.category]}
                      </span>
                      <span className="font-display text-lg font-medium tracking-tight text-foreground">
                        {t.title}
                      </span>
                      <span className="line-clamp-2 text-sm leading-relaxed text-muted">
                        {t.excerpt}
                      </span>
                    </button>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <ConnectUserAvatar name={t.author} size="sm" showName />
                      <button
                        type="button"
                        onClick={() => setSelectedId(t.id)}
                        className="text-left hover:text-foreground"
                      >
                        · {replyCount}{" "}
                        {replyCount === 1 ? "comment" : "comments"} · ♡{" "}
                        {t.likes} · {t.bumpedAt}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })
          )}
        </ul>

        <section
          className="min-h-[16rem] border-t border-border pt-6 lg:border-t-0 lg:pt-0"
          aria-live="polite"
        >
          {selected ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-accent-link">
                {CATEGORY_LABEL[selected.category]}
              </p>
              <h2 className="mt-2 font-display text-2xl font-medium tracking-tight text-foreground sm:text-3xl">
                {selected.title}
              </h2>
              <div className="mt-2 flex items-center gap-2">
                <ConnectUserAvatar name={selected.author} size="sm" showName />
                <span className="text-xs text-muted">· {selected.bumpedAt}</span>
              </div>
              <p className="mt-5 text-[15px] leading-relaxed text-foreground">
                {selected.body}
              </p>
              <StatsRow
                comments={countComments(selected.comments)}
                likes={selected.likes}
              />
              <button
                type="button"
                onClick={() => openDetail(selected.id)}
                className="mt-6 inline-flex items-center justify-center rounded-full accent-fill-gradient px-6 py-2.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90"
              >
                Open post
              </button>
            </div>
          ) : (
            <p className="text-sm text-muted">Select a post to preview.</p>
          )}
        </section>
      </div>
    </div>
  );
}
