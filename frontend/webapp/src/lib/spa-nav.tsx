/**
 * SPA shims for Next.js navigation APIs used by ported chrome components.
 */
import {
  Link as RRLink,
  useLocation,
  useNavigate,
  useSearchParams as useRRSearchParams,
  type LinkProps as RRLinkProps,
} from "react-router-dom";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type MouseEvent,
} from "react";
import { clearTabScroll, scrollAppToTop } from "@/lib/tab-scroll";

export function usePathname(): string {
  return useLocation().pathname;
}

function pathOnly(href: string): string {
  const q = href.indexOf("?");
  const h = href.indexOf("#");
  let end = href.length;
  if (q >= 0) end = Math.min(end, q);
  if (h >= 0) end = Math.min(end, h);
  return href.slice(0, end) || "/";
}

/** Scroll to top after a nav click (clears overview restore for the destination). */
function scheduleScrollToTop(href: string): void {
  clearTabScroll(pathOnly(href));
  const run = () => scrollAppToTop();
  queueMicrotask(run);
  requestAnimationFrame(run);
}

export function useRouter() {
  const navigate = useNavigate();
  return {
    push: (href: string) => {
      clearTabScroll(pathOnly(href));
      void navigate(href);
      scheduleScrollToTop(href);
    },
    replace: (href: string) => {
      clearTabScroll(pathOnly(href));
      void navigate(href, { replace: true });
      scheduleScrollToTop(href);
    },
    prefetch: (_href: string) => {
      /* no-op in SPA */
    },
    back: () => {
      void navigate(-1);
    },
  };
}

/** Next App Router–compatible: returns URLSearchParams only. */
export function useSearchParams(): URLSearchParams {
  const [params] = useRRSearchParams();
  return params;
}

type SpaLinkProps = Omit<ComponentPropsWithoutRef<"a">, "href"> & {
  href: string;
  replace?: boolean;
  prefetch?: boolean;
  /** When true (default), scroll the app shell to top on navigate — like Next.js Link. */
  scroll?: boolean;
};

/**
 * Drop-in for `next/link` — accepts `href`, maps to react-router `to`.
 * External http(s) links render a plain <a>.
 */
export const Link = forwardRef<HTMLAnchorElement, SpaLinkProps>(
  function SpaLink(
    { href, replace, onClick, scroll = true, children, ...rest },
    ref,
  ) {
    const external =
      /^https?:\/\//i.test(href) ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:");
    if (external) {
      return (
        <a ref={ref} href={href} onClick={onClick} {...rest}>
          {children}
        </a>
      );
    }
    const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(e);
      if (e.defaultPrevented || scroll === false) return;
      scheduleScrollToTop(href);
    };
    const rrProps: RRLinkProps = {
      to: href,
      replace,
      onClick: handleClick,
      ...rest,
    };
    return (
      <RRLink ref={ref} {...rrProps}>
        {children}
      </RRLink>
    );
  },
);
