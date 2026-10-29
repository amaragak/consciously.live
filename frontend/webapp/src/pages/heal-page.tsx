import { useEffect, useMemo } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { HealHome, HealRested } from "@/components/heal/heal-home";
import { HealItemView } from "@/components/heal/heal-item-view";
import { HealLetterView } from "@/components/heal/heal-letter-view";
import { HealSupportView } from "@/components/heal/heal-support-view";
import {
  ensureEntityUrlSlug,
  findEntityByPathSlug,
  healItemHref,
} from "@/lib/entity-href";
import { loadHealStore, saveHealStore } from "@/lib/heal-store";
import { looksLikeUuid } from "@/lib/readable-url";

export function HealHomePage() {
  return <HealHome />;
}

export function HealRestedPage() {
  return <HealRested />;
}

export function HealSupportPage() {
  return <HealSupportView />;
}

function useResolvedHealItemId(raw: string): string | null {
  return useMemo(() => {
    if (!raw) return null;
    const store = loadHealStore();
    const found = findEntityByPathSlug(store.items, raw);
    return found?.id ?? null;
  }, [raw]);
}

export function HealItemPage() {
  const { itemSlug = "" } = useParams();
  const navigate = useNavigate();
  const decoded = decodeURIComponent(itemSlug);
  const itemId = useResolvedHealItemId(decoded);

  useEffect(() => {
    if (!itemId) return;
    const store = loadHealStore();
    const ensured = ensureEntityUrlSlug(store.items, itemId);
    if (ensured.items !== store.items) {
      saveHealStore({ ...store, items: ensured.items });
    }
    const item = ensured.item ?? store.items.find((x) => x.id === itemId);
    if (!item) return;
    const href = healItemHref(item);
    if (
      href !== `/heal/${encodeURIComponent(decoded)}` ||
      looksLikeUuid(decoded) ||
      decoded.startsWith("heal_")
    ) {
      navigate(href, { replace: true });
    }
  }, [decoded, itemId, navigate]);

  if (!itemId) return <Navigate to="/heal" replace />;
  return <HealItemView itemId={itemId} />;
}

export function HealLetterPage() {
  const { itemSlug = "", entrySlug } = useParams();
  const navigate = useNavigate();
  const decoded = decodeURIComponent(itemSlug);
  const itemId = useResolvedHealItemId(decoded);

  useEffect(() => {
    if (!itemId) return;
    const store = loadHealStore();
    const ensured = ensureEntityUrlSlug(store.items, itemId);
    if (ensured.items !== store.items) {
      saveHealStore({ ...store, items: ensured.items });
    }
    const item = ensured.item ?? store.items.find((x) => x.id === itemId);
    if (!item) return;
    const base = healItemHref(item);
    const rest = entrySlug ? `/letter/${encodeURIComponent(entrySlug)}` : "/letter";
    const href = `${base}${rest}`;
    const current = window.location.pathname.replace(/\/$/, "");
    if (current === href) return;
    if (
      looksLikeUuid(decoded) ||
      decoded.startsWith("heal_") ||
      !current.startsWith(base)
    ) {
      navigate(href, { replace: true });
    }
  }, [decoded, entrySlug, itemId, navigate]);

  if (!itemId) return <Navigate to="/heal" replace />;
  return (
    <HealLetterView
      itemId={itemId}
      entryId={entrySlug ? decodeURIComponent(entrySlug) : undefined}
    />
  );
}
