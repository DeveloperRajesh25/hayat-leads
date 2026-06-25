"use client";

import { useState } from "react";
import {
  CheckCircle2,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  Send,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Interest = "" | "interested" | "not_interested";

export function LeadForm({
  token,
  defaultName = "",
  defaultPhone = "",
}: {
  token?: string;
  defaultName?: string;
  defaultPhone?: string;
}) {
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  const [interest, setInterest] = useState<Interest>("");
  const [requirement, setRequirement] = useState("");
  const [notes, setNotes] = useState("");
  const [company, setCompany] = useState(""); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) return setError("Please enter your name.");
    if (!phone.trim()) return setError("Please enter your phone number.");
    if (!interest)
      return setError("Please let us know if you are interested.");

    setSubmitting(true);
    try {
      const res = await fetch("/api/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token ?? null,
          name: name.trim(),
          phone: phone.trim(),
          interest_status: interest,
          requirement_details: requirement.trim(),
          notes: notes.trim(),
          company, // honeypot — must stay empty
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong. Please try again.");
        return;
      }
      setDone(true);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Thank you!</h2>
          <p className="max-w-sm text-sm text-slate-500">
            {interest === "interested"
              ? "We've received your details and our team will reach out to you shortly."
              : "We've recorded your response. Feel free to reach out whenever you're ready."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-5">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Honeypot — hidden from real users */}
          <div className="absolute -left-[9999px]" aria-hidden="true">
            <label htmlFor="company">Company</label>
            <input
              id="company"
              name="company"
              tabIndex={-1}
              autoComplete="off"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="name">Full name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
            />
          </div>

          <div>
            <Label htmlFor="phone">Phone number *</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +91 98765 43210"
              required
            />
          </div>

          <div>
            <Label>Are you interested in our services? *</Label>
            <div className="mt-1 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setInterest("interested")}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border-2 p-4 text-sm font-medium transition-colors",
                  interest === "interested"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 text-slate-600 hover:border-slate-300",
                )}
              >
                <ThumbsUp className="h-5 w-5" />
                Yes, interested
              </button>
              <button
                type="button"
                onClick={() => setInterest("not_interested")}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border-2 p-4 text-sm font-medium transition-colors",
                  interest === "not_interested"
                    ? "border-red-400 bg-red-50 text-red-700"
                    : "border-slate-200 text-slate-600 hover:border-slate-300",
                )}
              >
                <ThumbsDown className="h-5 w-5" />
                Not right now
              </button>
            </div>
          </div>

          <div>
            <Label htmlFor="requirement">Requirement details</Label>
            <Textarea
              id="requirement"
              value={requirement}
              onChange={(e) => setRequirement(e.target.value)}
              placeholder="Tell us about your space, budget, timeline, style preferences…"
            />
          </div>

          <div>
            <Label htmlFor="notes">Additional notes</Label>
            <Textarea
              id="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything else we should know?"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            loading={submitting}
          >
            {!submitting && <Send className="h-4 w-4" />}
            Submit
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
