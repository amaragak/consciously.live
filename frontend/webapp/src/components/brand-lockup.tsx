import {
  BRAND_LOCKUP_INNER,
  BRAND_LOCKUP_SCALE,
  ensureBrandLockupCss,
} from "@/lib/native/brand-lockup-markup";

export { BRAND_LOCKUP_SCALE };

ensureBrandLockupCss();

/** The splash lockup markup, verbatim. */
export function BrandLockup({
  placeholder,
  className,
}: {
  placeholder?: boolean;
  className?: string;
}) {
  return (
    <div
      className={[
        "brand-lockup",
        placeholder ? "brand-lockup--placeholder" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: BRAND_LOCKUP_INNER }}
    />
  );
}
