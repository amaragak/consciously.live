import "@/components/home-v2/home-v2.css";
import { ConnectPageShell } from "@/components/home-v2/connect-page-shell";

export default function ConnectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ConnectPageShell>{children}</ConnectPageShell>;
}
