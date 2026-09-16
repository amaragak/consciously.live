import { redirect } from "next/navigation";

/** Legacy URL — product section is Manifest. */
export default function DreamRedirectPage() {
  redirect("/manifest");
}
