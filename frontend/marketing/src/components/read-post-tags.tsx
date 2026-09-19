/** Topic chips for public Read list + article. */
export function ReadPostTags({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Tags">
      {tags.map((tag) => (
        <li key={tag.toLowerCase()}>
          <span className="inline-block rounded-md border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-foreground">
            {tag}
          </span>
        </li>
      ))}
    </ul>
  );
}
