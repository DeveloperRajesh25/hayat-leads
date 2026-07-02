"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WhatsAppButton } from "@/components/leads/whatsapp-button";
import { buildFormUrl } from "@/lib/config";

export function ContactActions({
  id,
  name,
  phone,
  token,
}: {
  id: string;
  name: string;
  phone: string;
  token: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/contacts/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Could not delete contact.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error while deleting contact.");
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center justify-end gap-2">
        {error && <span className="text-xs text-red-600">{error}</span>}
        <span className="text-xs text-slate-500">Delete {name}?</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirming(false)}
          disabled={deleting}
        >
          Cancel
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={handleDelete}
          loading={deleting}
        >
          Confirm
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Link
        href={buildFormUrl(token)}
        target="_blank"
        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Form
      </Link>
      <WhatsAppButton phone={phone} name={name} label="Chat" />
      <Button
        variant="outline"
        size="sm"
        onClick={() => setConfirming(true)}
        title="Delete contact"
      >
        <Trash2 className="h-3.5 w-3.5 text-red-600" />
      </Button>
    </div>
  );
}
