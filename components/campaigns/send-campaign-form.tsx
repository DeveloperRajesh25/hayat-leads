"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Send,
  Image as ImageIcon,
  AlertTriangle,
  CheckCircle2,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { publicConfig } from "@/lib/config";

interface SendResult {
  total: number;
  sent: number;
  failed: number;
  sampleError?: string | null;
}

export function SendCampaignForm({
  contactCount,
  configured,
}: {
  contactCount: number;
  configured: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState(publicConfig.whatsappImageUrl);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const disabled = contactCount === 0 || !configured;

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
        <p className="text-sm text-slate-500">
          Sends the WhatsApp template to all imported contacts, personalized
          with each customer&apos;s name and form link.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!configured && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              WhatsApp API is not configured yet. Add your credentials to
              <code className="mx-1 rounded bg-amber-100 px-1">.env.local</code>
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
          <p className="mt-1 text-xs text-slate-400">
            Sent to every customer. Defaults to
            <code className="mx-1">NEXT_PUBLIC_WHATSAPP_IMAGE_URL</code>.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          <Users className="h-4 w-4 text-slate-400" />
          <span>
            <span className="font-semibold text-slate-900">
              {contactCount.toLocaleString()}
            </span>{" "}
            contact{contactCount === 1 ? "" : "s"} will receive this message.
          </span>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Campaign sent.</p>
              <p className="text-emerald-700">
                {result.sent} delivered · {result.failed} failed of{" "}
                {result.total}.
              </p>
              {result.failed > 0 && result.sampleError && (
                <p className="mt-1 text-xs text-emerald-700/80">
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
            disabled={disabled}
          >
            <Send className="h-4 w-4" />
            Send campaign
          </Button>
        ) : (
          <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-amber-800">
              Send WhatsApp messages to {contactCount.toLocaleString()}{" "}
              contacts now?
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
