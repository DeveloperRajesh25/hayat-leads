"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Send,
  Image as ImageIcon,
  AlertTriangle,
  CheckCircle2,
  Users,
  Search,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatPhoneDisplay } from "@/lib/phone";
import { publicConfig } from "@/lib/config";
import type { Contact } from "@/lib/types";

interface SendResult {
  total: number;
  sent: number;
  failed: number;
  sampleError?: string | null;
}

export function SendCampaignForm({
  contacts,
  alreadyMessagedIds,
  configured,
}: {
  contacts: Pick<Contact, "id" | "name" | "phone">[];
  alreadyMessagedIds: string[];
  configured: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState(publicConfig.whatsappImageUrl);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const alreadyMessagedSet = useMemo(
    () => new Set(alreadyMessagedIds),
    [alreadyMessagedIds],
  );

  // Default: new contacts selected, contacts already messaged unselected.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(contacts.filter((c) => !alreadyMessagedSet.has(c.id)).map((c) => c.id)),
  );

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q),
    );
  }, [contacts, search]);

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(filteredContacts.map((c) => c.id)));
  }

  function selectNone() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const c of filteredContacts) next.delete(c.id);
      return next;
    });
  }

  const disabled = contacts.length === 0 || !configured;

  async function handleSend() {
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/campaigns/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || `Campaign ${new Date().toLocaleDateString()}`,
          imageUrl: imageUrl.trim(),
          contactIds: Array.from(selectedIds),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Failed to send campaign.");
        return;
      }
      setResult(data as SendResult);
      setName("");
      setConfirming(false);
      router.refresh();
    } catch {
      setError("Network error while sending campaign.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New campaign</CardTitle>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Sends the WhatsApp template to the selected contacts, personalized
          with each customer&apos;s name and form link.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!configured && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              WhatsApp API is not configured yet. Add your credentials to
              <code className="mx-1 rounded bg-amber-100 px-1 dark:bg-amber-500/20">.env.local</code>
              to enable sending.
            </span>
          </div>
        )}

        <div>
          <Label htmlFor="campaign-name">Campaign name</Label>
          <Input
            id="campaign-name"
            placeholder="e.g. June Promo — Modular Kitchens"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={sending}
          />
        </div>

        <div>
          <Label htmlFor="image-url">
            <span className="inline-flex items-center gap-1">
              <ImageIcon className="h-3.5 w-3.5" /> Header image URL
            </span>
          </Label>
          <Input
            id="image-url"
            placeholder="https://…/banner.jpg"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            disabled={sending}
          />
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Sent to every customer. Defaults to
            <code className="mx-1">NEXT_PUBLIC_WHATSAPP_IMAGE_URL</code>.
          </p>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <Label className="mb-0">Recipients</Label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="text-xs font-medium text-brand-600 hover:underline"
              >
                Select all
              </button>
              <span className="text-xs text-slate-300">·</span>
              <button
                type="button"
                onClick={selectNone}
                className="text-xs font-medium text-brand-600 hover:underline"
              >
                Select none
              </button>
            </div>
          </div>

          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <Input
              placeholder="Search contacts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              disabled={sending}
            />
          </div>

          <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
            {filteredContacts.length === 0 ? (
              <p className="p-4 text-center text-sm text-slate-400 dark:text-slate-500">
                No contacts match your search.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredContacts.map((c) => (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(c.id)}
                        onChange={() => toggle(c.id)}
                        disabled={sending}
                        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500/30 dark:border-slate-600 dark:bg-slate-800"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                          {c.name}
                        </span>
                        <span className="block text-xs text-slate-400 dark:text-slate-500">
                          {formatPhoneDisplay(c.phone)}
                        </span>
                      </span>
                      {alreadyMessagedSet.has(c.id) && (
                        <Badge tone="neutral">Already sent</Badge>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          <Users className="h-4 w-4 text-slate-400 dark:text-slate-500" />
          <span>
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {selectedIds.size.toLocaleString()}
            </span>{" "}
            of {contacts.length.toLocaleString()} contacts selected.
          </span>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Campaign sent.</p>
              <p className="text-emerald-700 dark:text-emerald-300/80">
                {result.sent} delivered · {result.failed} failed of{" "}
                {result.total}.
              </p>
              {result.failed > 0 && result.sampleError && (
                <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-300/60">
                  Example error: {result.sampleError}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Confirmation flow (sending real messages is irreversible) */}
        {!confirming ? (
          <Button
            onClick={() => {
              setResult(null);
              setError(null);
              setConfirming(true);
            }}
            disabled={disabled || selectedIds.size === 0}
          >
            <Send className="h-4 w-4" />
            Send campaign
          </Button>
        ) : (
          <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/20 dark:bg-amber-500/10 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-amber-800 dark:text-amber-300">
              Send WhatsApp messages to {selectedIds.size.toLocaleString()}{" "}
              contact{selectedIds.size === 1 ? "" : "s"} now?
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => setConfirming(false)}
                disabled={sending}
              >
                Cancel
              </Button>
              <Button onClick={handleSend} loading={sending}>
                Yes, send now
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
