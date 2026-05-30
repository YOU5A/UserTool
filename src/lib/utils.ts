export function formatAmount(amount: number | string, currency?: string): string {
  const num = Number(amount ?? 0);
  const resolvedCurrency = currency || localStorage.getItem("currency") || "CNY";
  const symbol = resolvedCurrency === "CNY" ? "\u00a5" : "$";
  return `${symbol}${num.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("zh-CN");
  } catch {
    return dateStr;
  }
}

export function formatDateTime(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString("zh-CN");
  } catch {
    return dateStr;
  }
}

export function getOperationText(type: string, amount: number): string {
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

export function cn(...inputs: (string | undefined | null | false)[]): string {
  return inputs.filter(Boolean).join(" ");
}

// ---------- 货币汇率与基础货币 ----------
const CNY_TO_USD_RATE = 1 / 7.25;   // 1 CNY = 0.1379 USD
const USD_TO_CNY_RATE = 7.25;       // 1 USD = 7.25 CNY

export function getBaseCurrency(): string {
  return localStorage.getItem("baseCurrency") || "CNY";
}

export function setBaseCurrency(c: string): void {
  localStorage.setItem("baseCurrency", c);
}

export function getConversionRate(from: string, to: string): number | null {
  if (from === to) return null;
  if (from === "CNY" && to === "USD") return CNY_TO_USD_RATE;
  if (from === "USD" && to === "CNY") return USD_TO_CNY_RATE;
  return null;
}