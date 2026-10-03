import { useEffect, useMemo, useState } from "react";
import {
  fetchAdminClaudePreprompts,
  type ClaudePrepromptRow,
} from "@/lib/medimade-api";

export function AdminPrepromptsPanel() {
  const [prompts, setPrompts] = useState<ClaudePrepromptRow[]>([]);
  const [deployedAt, setDeployedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetchAdminClaudePreprompts()
      .then((res) => {
        if (cancelled) return;
        setPrompts(res.prompts);
        setDeployedAt(res.meta?.deployedAt ?? null);
        setSelectedId(res.prompts[0]?.id ?? null);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load preprompts");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return prompts;
    return prompts.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.feature.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.sourcePath.toLowerCase().includes(q),
    );
  }, [prompts, query]);

  const selected =
    filtered.find((p) => p.id === selectedId) ?? filtered[0] ?? null;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl font-medium tracking-tight">
          Pre-prompts
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Claude system / pre-prompts as shipped in the codebase. Read-only —
          edit in git, then redeploy to refresh.
        </p>
        {deployedAt ? (
          <p className="mt-1 text-xs text-muted">
            Last seeded {new Date(deployedAt).toLocaleString()}
          </p>
        ) : null}
      </header>

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(14rem,20rem)_minmax(0,1fr)]">
          <aside className="min-w-0 space-y-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter…"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <ul className="max-h-[70vh] space-y-1 overflow-y-auto rounded-xl border border-border bg-card p-2">
              {filtered.map((p) => {
                const active = selected?.id === p.id;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(p.id)}
                      className={`w-full rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                        active
                          ? "bg-selected text-on-selected"
                          : "hover:bg-accent-soft/50"
                      }`}
                    >
                      <div className="font-medium leading-snug">{p.title}</div>
                      <div
                        className={`mt-0.5 text-[11px] ${
                          active ? "text-on-selected/80" : "text-muted"
                        }`}
                      >
                        {p.feature} · {p.kind}
                      </div>
                    </button>
                  </li>
                );
              })}
              {filtered.length === 0 ? (
                <li className="px-2 py-3 text-sm text-muted">No matches</li>
              ) : null}
            </ul>
          </aside>

          <section className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5">
            {selected ? (
              <>
                <h2 className="font-display text-lg font-medium">
                  {selected.title}
                </h2>
                <p className="mt-1 text-xs text-muted">
                  {selected.sourcePath}
                </p>
                <pre className="mt-4 max-h-[70vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/70 bg-background p-3 font-mono text-[12px] leading-relaxed text-foreground">
                  {selected.text}
                </pre>
              </>
            ) : (
              <p className="text-sm text-muted">
                No preprompts seeded yet. Redeploy ConsciouslyBackend.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
