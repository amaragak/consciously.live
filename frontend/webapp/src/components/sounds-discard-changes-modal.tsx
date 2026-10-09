import { SoundsConfirmModal } from "@/components/sounds-confirm-modal";

/**
 * Unsaved-changes confirm for Custom Sounds.
 */
export function SoundsDiscardChangesModal({
  open,
  mixName,
  onDiscard,
  onCancel,
}: {
  open: boolean;
  mixName: string;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  const label = mixName.trim() || "Untitled mix";

  return (
    <SoundsConfirmModal
      open={open}
      title="Discard changes?"
      description={
        <>
          Discard changes to{" "}
          <span className="font-medium text-foreground">{label}</span>? This
          can’t be undone.
        </>
      }
      confirmLabel="Discard"
      onConfirm={onDiscard}
      onCancel={onCancel}
    />
  );
}
