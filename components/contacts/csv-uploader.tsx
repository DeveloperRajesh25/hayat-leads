"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertTriangle,
  X,
} from "lucide-react";
import { parseContactsCsv, type ParsedCsvResult } from "@/lib/csv";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPhoneDisplay } from "@/lib/phone";

interface ImportResult {
  inserted: number;
  skippedExisting: number;
  duplicatesInFile: number;
  invalid: number;
  total: number;
}

export function CsvUploader() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedCsvResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFile(null);
    setFileName(null);
    setParsed(null);
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleFile(selected: File | null) {
    setResult(null);
    setError(null);
    setParsed(null);
    if (!selected) return;

    if (!/\.csv$/i.test(selected.name) && selected.type !== "text/csv") {
      setError("Please select a .csv file.");
      return;
    }
    setFile(selected);
    setFileName(selected.name);
    try {
      const text = await selected.text();
      const result = parseContactsCsv(text);
      if (result.total === 0) {
        setError("The file appears to be empty.");
        return;
      }
      setParsed(result);
    } catch {
      setError("Could not read the file.");
    }
  }

  async function handleImport() {
    if (!file) return;
    setImporting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/contacts/upload", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Upload failed.");
        return;
      }
      setResult(data as ImportResult);
      setFile(null);
      setParsed(null);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch {
      setError("Network error during upload.");
    } finally {
      setImporting(false);
    }
  }

  const previewRows = parsed?.rows.slice(0, 50) ?? [];

  return (
    <Card>
      <CardContent className="space-y-4">
        {/* Dropzone / picker */}
        <label
          htmlFor="csv-input"
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center transition-colors hover:border-brand-400 hover:bg-brand-50/40"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-100 text-brand-600">
            <UploadCloud className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-700">
              {fileName ?? "Click to select a CSV file"}
            </p>
            <p className="text-xs text-slate-400">
              Columns: customer name &amp; phone number · Max 5 MB
            </p>
          </div>
          <input
            id="csv-input"
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
        </label>

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
              <p className="font-medium">
                Imported {result.inserted} new contact
                {result.inserted === 1 ? "" : "s"}.
              </p>
              <p className="text-emerald-700">
                {result.skippedExisting} already existed ·{" "}
                {result.duplicatesInFile} duplicate(s) in file ·{" "}
                {result.invalid} invalid row(s).
              </p>
            </div>
          </div>
        )}

        {/* Preview */}
        {parsed && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="success">{parsed.validCount} valid</Badge>
              {parsed.invalidCount > 0 && (
                <Badge tone="danger">{parsed.invalidCount} invalid</Badge>
              )}
              <span className="text-xs text-slate-400">
                Showing first {previewRows.length} of {parsed.total} rows
              </span>
            </div>

            <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Phone</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r, i) => (
                    <tr
                      key={i}
                      className="border-t border-slate-100 last:border-0"
                    >
                      <td className="px-3 py-2 text-slate-700">{r.name}</td>
                      <td className="px-3 py-2 text-slate-700">
                        {r.valid ? formatPhoneDisplay(r.phone) : r.rawPhone || "—"}
                      </td>
                      <td className="px-3 py-2">
                        {r.valid ? (
                          <span className="text-emerald-600">Valid</span>
                        ) : (
                          <span className="text-red-600">{r.error}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={handleImport}
                loading={importing}
                disabled={parsed.validCount === 0}
              >
                <FileText className="h-4 w-4" />
                Import {parsed.validCount} contact
                {parsed.validCount === 1 ? "" : "s"}
              </Button>
              <Button variant="ghost" onClick={reset} disabled={importing}>
                <X className="h-4 w-4" />
                Clear
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
