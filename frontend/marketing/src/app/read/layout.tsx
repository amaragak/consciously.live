import "@/components/home-v2/home-v2.css";
import { ReadFieldShell } from "@/components/home-v2/read-field-shell";

/**
 * Read section — homepage-matching paisley field with transparent nav chrome
 * and the same scroll sticky header as home.
 */
export default function ReadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ReadFieldShell>{children}</ReadFieldShell>;
}
