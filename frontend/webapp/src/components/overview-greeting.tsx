import { useEffect, useState } from "react";
import {
  formatOverviewGreetingTitle,
  pickOverviewGreeting,
  type OverviewGreetingLine,
} from "@/content/overview-greetings";
import {
  getMedimadeSessionDisplayName,
  getMedimadeSessionEmail,
  isMedimadeGuestAccount,
} from "@/lib/auth-session";

function sessionFirstName(): string | null {
  const raw = getMedimadeSessionDisplayName()?.trim();
  if (raw && !/^guest$/i.test(raw)) {
    return raw.split(/\s+/)[0] || raw;
  }
  if (isMedimadeGuestAccount()) {
    const email = getMedimadeSessionEmail()?.trim() ?? "";
    const local = email.split("@")[0]?.trim();
    if (local) return local;
  }
  return null;
}

/** Feature greeting for Meditate / Journal overview (not time-of-day). */
export function OverviewGreeting({
  pool,
  fixed,
}: {
  pool: OverviewGreetingLine[];
  /** When set, skip rotation (e.g. Journal empty state). */
  fixed?: OverviewGreetingLine | null;
}) {
  const [line, setLine] = useState<OverviewGreetingLine>(
    () => fixed ?? pool[0] ?? { title: "", subline: "" },
  );
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    setName(sessionFirstName());
    setLine(fixed ?? pickOverviewGreeting(pool));
  }, [fixed, pool]);

  const title = formatOverviewGreetingTitle(line.title, name);
  const subDesktop = line.subline;
  const subMobile = line.sublineMobile ?? line.subline;

  return (
    <header className="flex flex-col gap-1">
      <h1 className="font-display text-[32px] font-normal leading-[1.15] text-foreground max-md:text-[26px]">
        {title}
      </h1>
      <p className="text-base leading-snug text-foreground max-md:hidden">
        {subDesktop}
      </p>
      <p className="text-sm leading-snug text-foreground md:hidden">{subMobile}</p>
    </header>
  );
}
