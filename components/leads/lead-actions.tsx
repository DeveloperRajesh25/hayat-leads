"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WhatsAppButton } from "@/components/leads/whatsapp-button";

export function LeadActions({
  id,
  name,
  phone,
}: {
  id: string;
  name: string;
  phone: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Could not delete lead.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error while deleting lead.");
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center justify-end gap-2">
        {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
        <span className="text-xs text-slate-500 dark:text-slate-400">Delete {name}?</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirming(false)}
          disabled={deleting}
        >
          Cancel
        </Button>
        <Button variant="danger" size="sm" onClick={handleDelete} loading={deleting}>
          Confirm
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <WhatsAppButton phone={phone} name={name} />
      <Button
        variant="outline"
        size="sm"
        onClick={() => setConfirming(true)}
        title="Delete lead"
      >
        <Trash2 className="h-3.5 w-3.5 text-red-600" />
      </Button>
    </div>
  );
}
