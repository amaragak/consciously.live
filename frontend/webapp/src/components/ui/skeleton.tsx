/**
 * Shared pulse placeholder for loading states.
 * Prefer putting `loading` on real layout components; use this inside those
 * components for text / media slots so chrome stays shared.
 */
export function Skeleton({
  className = "",
  style,
  ...rest
}: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div
      aria-hidden
      className={`mm-skeleton rounded-md ${className}`.trim()}
      style={style}
      {...rest}
    />
  );
}
