import type { ReactNode } from "react";
import { BookOpen, Focus, MessageSquare, Sparkles } from "lucide-react";
import type { HomeV2ToolId } from "@/components/home-v2/constants";
import { MeditateMark } from "@/components/meditate-mark";

/** Same glyphs as the SPA / marketing app sidebar section icons. */
export function HomeV2ToolIcon({
  tool,
  size = 18,
  className = "size-[18px] shrink-0",
}: {
  tool: HomeV2ToolId;
  size?: number;
  className?: string;
}): ReactNode {
  switch (tool) {
    case "meditate":
      return (
        <MeditateMark size={Math.max(size, 21)} className="size-[21px] shrink-0" />
      );
    case "journal":
      return (
        <BookOpen
          aria-hidden
          className={className}
          strokeWidth={1.75}
          width={size}
          height={size}
        />
      );
    case "manifest":
      return (
        <Sparkles
          aria-hidden
          className={className}
          strokeWidth={1.75}
          width={size}
          height={size}
        />
      );
    case "focus":
      return (
        <Focus
          aria-hidden
          className={className}
          strokeWidth={1.75}
          width={size}
          height={size}
        />
      );
    case "chat":
      return (
        <MessageSquare
          aria-hidden
          className={className}
          strokeWidth={1.75}
          width={size}
          height={size}
        />
      );
    default:
      return null;
  }
}
