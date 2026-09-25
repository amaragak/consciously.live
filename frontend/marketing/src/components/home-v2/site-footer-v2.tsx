import Link from "next/link";
import {
  HOME_V2_CONNECT_HREF,
  HOME_V2_INSTAGRAM_HREF,
  HOME_V2_LISTEN_HREF,
  HOME_V2_READ_HREF,
} from "@/components/home-v2/constants";

export function SiteFooterV2() {
  return (
    <footer className="flex flex-col gap-4 border-t border-[var(--hv2-line)] px-5 py-8 text-[15px] md:flex-row md:items-start md:justify-between md:gap-8 md:px-[min(120px,8vw)] md:py-12">
      <Link
        href="/"
        className="home-v2-display text-2xl font-medium md:text-[26px]"
      >
        consciously
      </Link>
      <div className="flex flex-wrap gap-5 md:gap-7">
        <Link href={HOME_V2_LISTEN_HREF} className="hover:text-[var(--hv2-tan-text)]">
          Listen
        </Link>
        <Link href={HOME_V2_READ_HREF} className="hover:text-[var(--hv2-tan-text)]">
          Read
        </Link>
        <Link href={HOME_V2_CONNECT_HREF} className="hover:text-[var(--hv2-tan-text)]">
          Connect
        </Link>
        <a
          href={HOME_V2_INSTAGRAM_HREF}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-[var(--hv2-tan-text)]"
        >
          Instagram
        </a>
      </div>
      <p className="m-0 text-[13px] text-[var(--hv2-muted)] md:text-[15px]">
        © 2026 Consciously
      </p>
    </footer>
  );
}
