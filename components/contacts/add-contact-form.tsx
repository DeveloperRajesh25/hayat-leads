"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AddContactForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Could not add contact.");
        return;
      }
      setName("");
      setPhone("");
      router.refresh();
    } catch {
      setError("Network error while adding contact.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a contact</CardTitle>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Add a single lead manually instead of uploading a CSV.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label htmlFor="contact-name">Name</Label>
            <Input
              id="contact-name"
              placeholder="Customer name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              required
            />
          </div>
          <div className="flex-1">
            <Label htmlFor="contact-phone">Phone</Label>
            <Input
              id="contact-phone"
              placeholder="98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={saving}
              required
            />
          </div>
          <Button type="submit" loading={saving}>
            <UserPlus className="h-4 w-4" />
            Add contact
          </Button>
        </form>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
