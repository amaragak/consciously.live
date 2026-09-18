import { permanentRedirect } from "next/navigation";

export default function AdminBlogRedirect() {
  permanentRedirect("/admin/read");
}
