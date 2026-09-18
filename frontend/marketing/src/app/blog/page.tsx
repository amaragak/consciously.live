import { permanentRedirect } from "next/navigation";

export default function BlogIndexRedirect() {
  permanentRedirect("/read");
}
