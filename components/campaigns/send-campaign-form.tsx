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
  LayoutTemplate,
  Video,
  FileText,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatPhoneDisplay } from "@/lib/phone";
import { publicConfig } from "@/lib/config";
import {
  headerMediaLabel,
  isMediaHeader,
  previewBody,
  templateKey,
  type WhatsappTemplate,
} from "@/lib/templates";
import { runCampaignBatches, type CampaignBatchProgress } from "@/lib/campaign-batch-client";
import type { Contact } from "@/lib/types";

type SendResult = CampaignBatchProgress;

export function SendCampaignForm({
  contacts,
  alreadyMessagedIds,
  configured,
  templates,
  templatesError,
  defaultTemplateName,
}: {
  contacts: Pick<Contact, "id" | "name" | "phone">[];
  alreadyMessagedIds: string[];
  configured: boolean;
  templates: WhatsappTemplate[];
  templatesError: string | null;
  defaultTemplateName: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");

  // Start on the template named by NEXT_PUBLIC_WHATSAPP_TEMPLATE_NAME when it
  // is still approved, otherwise just the first available one.
  const [selectedKey, setSelectedKey] = useState<string>(() => {
    const preferred =
      templates.find((t) => t.name === defaultTemplateName) ?? templates[0];
    return preferred ? templateKey(preferred) : "";
  });

  const selectedTemplate = useMemo(
    () => templates.find((t) => templateKey(t) === selectedKey) ?? null,
    [templates, selectedKey],
  );

  // Header media is per-template: each template has its own image/video, and a
  // video template can't reuse the image default. Keyed so switching back and
  // forth doesn't lose what you typed.
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const t of templates) {
      initial[templateKey(t)] =
        t.headerFormat === "IMAGE" ? publicConfig.whatsappImageUrl : "";
    }
    return initial;
  });

  const needsMedia = selectedTemplate
    ? isMediaHeader(selectedTemplate.headerFormat)
    : false;
  const mediaUrl = selectedKey ? (mediaUrls[selectedKey] ?? "") : "";

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

  // Sending is blocked when there is nothing to send, no credentials, no
  // template chosen, or a media template with no media URL filled in.
  const missingMedia = needsMedia && mediaUrl.trim() === "";
  const disabled =
    contacts.length === 0 || !configured || !selectedTemplate || missingMedia;

  async function handleSend() {
    if (!selectedTemplate) return;
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/campaigns/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || `Campaign ${new Date().toLocaleDateString()}`,
          templateName: selectedTemplate.name,
          templateLang: selectedTemplate.language,
          imageUrl: needsMedia ? mediaUrl.trim() : "",
          contactIds: Array.from(selectedIds),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Failed to send campaign.");
        return;
      }

      // Sending itself happens as a series of small batches so a large list
      // can't time out a single request — see lib/campaign-batch-client.ts.
      // Progress is persisted server-side after every batch, so if this loop
      // is interrupted (closed tab, network drop) the campaign can be
      // finished later from "Resume sending" in the history table.
      setName("");
      setConfirming(false);
      await runCampaignBatches(data.campaignId, data.total, setResult);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} You can continue this campaign from "Resume sending" in the history below.`
          : "Network error while sending campaign.",
      );
      router.refresh();
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
          <Label htmlFor="template">
            <span className="inline-flex items-center gap-1">
              <LayoutTemplate className="h-3.5 w-3.5" /> Template
            </span>
          </Label>
          {templates.length === 0 ? (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {templatesError ??
                  "No approved templates found on this WhatsApp Business Account."}
              </span>
            </div>
          ) : (
            <>
              <Select
                id="template"
                value={selectedKey}
                onChange={(e) => setSelectedKey(e.target.value)}
                disabled={sending}
              >
                {templates.map((t) => (
                  <option key={templateKey(t)} value={templateKey(t)}>
                    {t.name} ({t.language})
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                Approved templates from WhatsApp Manager. Create or edit them
                there — new ones show up here automatically.
              </p>
            </>
          )}
        </div>

        {selectedTemplate && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge tone="neutral">
                <span className="inline-flex items-center gap-1">
                  {selectedTemplate.headerFormat === "VIDEO" ? (
                    <Video className="h-3 w-3" />
                  ) : selectedTemplate.headerFormat === "IMAGE" ? (
                    <ImageIcon className="h-3 w-3" />
                  ) : (
                    <FileText className="h-3 w-3" />
                  )}
                  {selectedTemplate.headerFormat === "NONE"
                    ? "No header"
                    : `${selectedTemplate.headerFormat} header`}
                </span>
              </Badge>
              {selectedTemplate.urlButtonIndex !== null && (
                <Badge tone="success">Form link button</Badge>
              )}
              {selectedTemplate.bodyVariableCount === 0 && (
                <Badge tone="neutral">No name personalization</Badge>
              )}
            </div>
            {selectedTemplate.headerText && (
              <p className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
                {selectedTemplate.headerText}
              </p>
            )}
            <p className="max-h-32 overflow-y-auto whitespace-pre-wrap text-xs text-slate-500 dark:text-slate-400">
              {previewBody(selectedTemplate, "<customer name>")}
            </p>
          </div>
        )}

        {selectedTemplate && needsMedia && (
          <div>
            <Label htmlFor="image-url">
              <span className="inline-flex items-center gap-1">
                {selectedTemplate.headerFormat === "VIDEO" ? (
                  <Video className="h-3.5 w-3.5" />
                ) : (
                  <ImageIcon className="h-3.5 w-3.5" />
                )}{" "}
                {headerMediaLabel(selectedTemplate.headerFormat)}
              </span>
            </Label>
            <Input
              id="image-url"
              placeholder={
                selectedTemplate.headerFormat === "VIDEO"
                  ? "https://…/clip.mp4"
                  : "https://…/banner.jpg"
              }
              value={mediaUrl}
              onChange={(e) =>
                setMediaUrls((prev) => ({
                  ...prev,
                  [selectedKey]: e.target.value,
                }))
              }
              disabled={sending}
            />
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              {selectedTemplate.headerFormat === "VIDEO" ? (
                <>
                  This template’s header is a video, so it needs a public, direct
                  MP4 link (not a YouTube page).
                </>
              ) : (
                <>
                  Sent to every customer. Must be a public, direct image link
                  (JPG/PNG). Defaults to
                  <code className="mx-1">NEXT_PUBLIC_WHATSAPP_IMAGE_URL</code>.
                </>
              )}{" "}
              Google Drive share links are auto-converted — just make sure the
              file is shared as “Anyone with the link”.
            </p>
          </div>
        )}

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

        {result && (() => {
          // Sent + Failed + Pending always equals Total, so the numbers here
          // match the history table exactly — no more "80 of 462" confusion.
          const pending = Math.max(
            0,
            result.pending ?? result.total - result.sent - result.failed,
          );
          const complete = !sending && pending === 0;
          const paused = !sending && pending > 0; // stopped with work left = resumable
          const tone = complete
            ? "emerald"
            : paused
              ? "amber"
              : "sky";
          const toneClass = {
            emerald:
              "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300",
            amber:
              "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300",
            sky: "bg-sky-50 text-sky-800 dark:bg-sky-500/10 dark:text-sky-300",
          }[tone];
          return (
            <div className={`flex items-start gap-2 rounded-lg p-3 text-sm ${toneClass}`}>
              {complete ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <div>
                <p className="font-medium">
                  {sending
                    ? result.throttled
                      ? `Pacing for WhatsApp rate limit… ${result.sent + result.failed} of ${result.total} done`
                      : `Sending… ${result.sent + result.failed} of ${result.total} done`
                    : complete
                      ? "Campaign complete — every contact processed."
                      : `Paused — ${pending} of ${result.total} still to send.`}
                </p>
                <p className="opacity-90">
                  {result.sent} sent · {result.failed} failed · {pending} pending
                  {" "}of {result.total}.
                </p>
                {paused && (
                  <p className="mt-1 text-xs opacity-80">
                    The remaining {pending} keep sending automatically in the
                    background. If they don’t finish, use “Resume sending” on this
                    campaign in the history table — nobody already sent is
                    contacted again.
                  </p>
                )}
                {complete && (
                  <p className="mt-1 text-xs opacity-80">
                    “Sent” means WhatsApp accepted the message; final delivery is
                    confirmed a moment later and the history updates automatically.
                    {result.failed > 0
                      ? " Use “Retry failed” in the history to re-send only the failures."
                      : ""}
                  </p>
                )}
                {result.failed > 0 && result.sampleError && (
                  <p className="mt-1 text-xs opacity-80">
                    Example error: {result.sampleError}
                  </p>
                )}
              </div>
            </div>
          );
        })()}

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
              Send <span className="font-semibold">{selectedTemplate?.name}</span>{" "}
              to {selectedIds.size.toLocaleString()} contact
              {selectedIds.size === 1 ? "" : "s"} now?
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
