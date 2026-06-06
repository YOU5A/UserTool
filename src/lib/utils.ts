import type { HistoryRecord } from "@/types";
export function formatAmount(amount: number | string, _currency?: string): string {
  const num = Number(amount ?? 0);
  return `\u00a5${num.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  // ISO 格式: "2024-09-14" 或 "2026-06-05T17:54:07"
  if (dateStr.includes("-")) {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  }
  // M.D 或 M,D 格式: "2.25" / "3,27"
  const normalized = dateStr.replace(",", ".");
  const parts = normalized.split(".");
  if (parts.length === 2) {
    const month = parseInt(parts[0], 10);
    const day = parseInt(parts[1], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const now = new Date();
      return new Date(now.getFullYear(), month - 1, day);
    }
  }
  return null;
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = parseDate(dateStr);
  if (!d) return dateStr;
  try {
    return d.toLocaleDateString("zh-CN");
  } catch {
    return dateStr;
  }
}

export function formatDateTime(dateStr: string): string {
  if (!dateStr) return "";
  const d = parseDate(dateStr);
  if (!d) return dateStr;
  try {
    return d.toLocaleString("zh-CN");
  } catch {
    return dateStr;
  }
}

export function getOperationText(type: HistoryRecord["type"], amount: number): string {
  return type === "add" ? `充值 ${formatAmount(amount)}` : `消费 ${formatAmount(amount)}`;
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatDateForFilename(date: Date): string {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const mm = pad2(date.getMinutes());
  const ss = pad2(date.getSeconds());
  return `${y}${m}${d}-${hh}${mm}${ss}`;
}

export function downloadJSON(obj: unknown, filename: string): void {
  const json = JSON.stringify(obj, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}



/** ??????????????????4?????? */
export function normalizeCardNo(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 4);
  return digits.padStart(4, "0");
}

/** ????????????4????0001-9999????0000 */
export function isValidCardNo(cardNo: string): boolean {
  return /^\d{4}$/.test(cardNo);
}



let baseCurrency = "CNY";
const rates: Record<string, Record<string, number>> = {
  CNY: { USD: 1 / 7.25, CNY: 1 },
  USD: { CNY: 7.25, USD: 1 },
};

export function getBaseCurrency(): string {
  return baseCurrency;
}

export function setBaseCurrency(c: string): void {
  baseCurrency = c;
}

export function getConversionRate(from: string, to: string): number {
  return rates[from]?.[to] ?? 1;
}

export function cn(...inputs: (string | undefined | null | false)[]): string {
  return inputs.filter(Boolean).join(" ");
}