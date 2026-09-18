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

export function usePathname(): string {
  return useLocation().pathname;
}

export function useRouter() {
  const navigate = useNavigate();
  return {
    push: (href: string) => {
      void navigate(href);
    },
    replace: (href: string) => {
      void navigate(href, { replace: true });
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
  scroll?: boolean;
};

/**
 * Drop-in for `next/link` — accepts `href`, maps to react-router `to`.
 * External http(s) links render a plain <a>.
 */
export const Link = forwardRef<HTMLAnchorElement, SpaLinkProps>(
  function SpaLink({ href, replace, onClick, children, ...rest }, ref) {
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
    const rrProps: RRLinkProps = {
      to: href,
      replace,
      onClick: onClick as ((e: MouseEvent<HTMLAnchorElement>) => void) | undefined,
      ...rest,
    };
    return (
      <RRLink ref={ref} {...rrProps}>
        {children}
      </RRLink>
    );
  },
);
