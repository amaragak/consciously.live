import Link from "next/link";

const PREVIOUS_VERSIONS = [
  { href: "/legacy", label: "Old homepage" },
  { href: "/legacy/meditate", label: "Old Meditate" },
  { href: "/legacy/journal", label: "Old Journal" },
  { href: "/legacy/manifest", label: "Old Manifest" },
  { href: "/legacy/focus", label: "Old Focus" },
  { href: "/legacy/chat", label: "Old Chat" },
] as const;

/** Shared “Previous versions” block for profile menus. */
export function PreviousVersionsMenu({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="my-1 border-t border-border" role="separator" />
      <p className="px-4 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted">
        Previous versions
      </p>
      {PREVIOUS_VERSIONS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          className="block w-full px-4 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent-soft/50"
        >
          {item.label}
        </Link>
      ))}
    </>
  );
}
