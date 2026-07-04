"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export function LeadsFilter() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const status = params.get("status") ?? "all";

  function update(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (!value || value === "all") sp.delete(key);
      else sp.set(key, value);
    }
    sp.delete("page"); // reset to first page on any filter change
    const qs = sp.toString();
    router.push(qs ? `/leads?${qs}` : "/leads");
  }

  const hasFilters = Boolean(params.get("q") || params.get("status"));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        update({ q });
      }}
      className="flex flex-col gap-2 sm:flex-row sm:items-center"
    >
      <Select
        aria-label="Filter by interest"
        className="sm:w-48"
        value={status}
        onChange={(e) => update({ status: e.target.value })}
      >
        <option value="all">All responses</option>
        <option value="interested">Interested</option>
        <option value="not_interested">Not interested</option>
        <option value="converted">Converted</option>
      </Select>

      <div className="flex flex-1 items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <Input
            className="pl-9"
            placeholder="Search by name or phone…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Button type="submit" variant="outline">
          Search
        </Button>
        {hasFilters && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setQ("");
              router.push("/leads");
            }}
            title="Clear filters"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </form>
  );
}
