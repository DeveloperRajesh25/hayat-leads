import Papa from "papaparse";
import { normalizePhone } from "./phone";
import { publicConfig } from "./config";

export interface ParsedContactRow {
  /** 1-based source row number (for error reporting). */
  rowNumber: number;
  name: string;
  rawPhone: string;
  /** Normalized E.164 digits, or "" when invalid. */
  phone: string;
  valid: boolean;
  error?: string;
}

export interface ParsedCsvResult {
  rows: ParsedContactRow[];
  total: number;
  validCount: number;
  invalidCount: number;
}

const HEADER_PATTERN = /name|phone|mobile|number|contact/i;
const NAME_PATTERN = /name/i;
const PHONE_PATTERN = /phone|mobile|number|contact/i;

/**
 * Parse a contacts CSV (text) into validated rows. Shared by the client preview
 * and the server upload route so both agree on the result.
 *
 * Accepts files with or without a header row. Columns are auto-detected from
 * the header; otherwise column 0 = name and column 1 = phone.
 */
export function parseContactsCsv(
  text: string,
  defaultCountryCode: string = publicConfig.defaultCountryCode,
): ParsedCsvResult {
  const parsed = Papa.parse<string[]>((text ?? "").trim(), {
    skipEmptyLines: "greedy",
  });

  const data = (parsed.data ?? []).filter(
    (r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim() !== ""),
  );

  if (data.length === 0) {
    return { rows: [], total: 0, validCount: 0, invalidCount: 0 };
  }

  let nameIdx = 0;
  let phoneIdx = 1;
  let start = 0;

  const firstRow = data[0].map((c) => String(c ?? "").toLowerCase().trim());
  const looksLikeHeader = firstRow.some((c) => HEADER_PATTERN.test(c));

  if (looksLikeHeader) {
    start = 1;
    const ni = firstRow.findIndex((c) => NAME_PATTERN.test(c));
    const pi = firstRow.findIndex((c) => PHONE_PATTERN.test(c));
    if (ni !== -1) nameIdx = ni;
    if (pi !== -1) phoneIdx = pi;
    if (nameIdx === phoneIdx) {
      nameIdx = 0;
      phoneIdx = 1;
    }
  }

  const rows: ParsedContactRow[] = [];
  for (let i = start; i < data.length; i++) {
    const r = data[i];
    const name = String(r[nameIdx] ?? "").trim();
    const rawPhone = String(r[phoneIdx] ?? "").trim();
    const phone = normalizePhone(rawPhone, defaultCountryCode);

    let error: string | undefined;
    if (!name && !rawPhone) {
      continue; // fully empty line
    } else if (!rawPhone) {
      error = "Missing phone number";
    } else if (!phone) {
      error = "Invalid phone number";
    } else if (!name) {
      error = "Missing name";
    }

    rows.push({
      rowNumber: i + 1,
      name: name || "(no name)",
      rawPhone,
      phone: phone ?? "",
      valid: !error,
      error,
    });
  }

  const validCount = rows.filter((r) => r.valid).length;
  return {
    rows,
    total: rows.length,
    validCount,
    invalidCount: rows.length - validCount,
  };
}

/** Escape a single CSV field per RFC 4180 (quote when needed). */
function escapeCsvField(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Build CSV text from a header row + data rows. Used by the dashboard's
 * per-stat "download" export route.
 */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((row) =>
    row.map(escapeCsvField).join(","),
  );
  // Leading BOM so Excel opens UTF-8 CSVs (e.g. names with accents) correctly.
  return String.fromCharCode(0xfeff) + lines.join("\r\n") + "\r\n";
}
