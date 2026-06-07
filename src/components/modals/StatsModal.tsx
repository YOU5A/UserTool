import { useState, useRef, useMemo, useCallback } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Title, Tooltip, Legend, Filler
} from "chart.js";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAppStore } from "@/store/useAppStore";
import { useVIPManager } from "@/hooks/useVIPManager";
import { formatAmount } from "@/lib/utils";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

function dateStr(d: Date): string {
  const pad2 = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function getMonthEnd(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export function StatsModal() {
  const modalsStats = useAppStore((s) => s.modals.stats);
  const closeModal = useAppStore((s) => s.closeModal);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const { mgr } = useVIPManager();
  const today = new Date();
  const defaultStart = new Date(today); defaultStart.setDate(defaultStart.getDate() - 3);
  const defaultEnd = new Date(today); defaultEnd.setDate(defaultEnd.getDate() + 4);

  const [startDate, setStartDate] = useState(dateStr(defaultStart));
  const [endDate, setEndDate] = useState(dateStr(defaultEnd));
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);
  const [preset, setPreset] = useState<"default" | "week" | "month" | null>("default");

  const onClose = useCallback(() => { closeModal("stats"); setActiveView("users"); }, [closeModal, setActiveView]);

  const stats = useMemo(() => mgr.getStatsData(startDate, endDate), [mgr, startDate, endDate, modalsStats]);

  const hasTrendData = stats.consumptionTrend.length > 0;
  const isSinglePoint = stats.consumptionTrend.length === 1;

  const chartData = useMemo(() => ({
    labels: stats.consumptionTrend.map(d => d.date.slice(5)),
    datasets: [
      {
        label: "总余额", data: stats.consumptionTrend.map(d => d.balance), borderColor: "#165DFF", backgroundColor: "rgba(22,93,255,0.1)", fill: true, tension: 0.3, yAxisID: "y",
      },
      {
        label: "日消费", data: stats.consumptionTrend.map(d => d.amount), borderColor: "#F53F3F", backgroundColor: "rgba(245,63,63,0.1)", fill: true, tension: 0.3, yAxisID: "y1",
      },
    ],
  }), [stats]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index" as const, intersect: false },
    plugins: { legend: { position: "top" as const } },
    scales: {
      y: { type: "linear" as const, position: "left" as const, title: { display: true, text: "总余额" } },
      y1: { type: "linear" as const, position: "right" as const, title: { display: true, text: "日消费" }, grid: { drawOnChartArea: false } },
    },
    elements: { point: { radius: isSinglePoint ? 5 : undefined } },
  }), [isSinglePoint]);

  const applyPreset = useCallback((name: "default" | "week" | "month", daysBack: number, daysForward: number) => {
    const s = new Date(today); s.setDate(s.getDate() - daysBack);
    const e = new Date(today); e.setDate(e.getDate() + daysForward);
    setStartDate(dateStr(s));
    setEndDate(dateStr(e));
    setPreset(name);
  }, [today]);

  return (
    <Dialog open={modalsStats} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="!max-w-[90rem] w-full !overflow-y-hidden" onClose={onClose}>
        <div className="flex flex-col" style={{ height: "calc(90vh - 6rem)" }}>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3 shrink-0">数据统计</h2>

          <div className="flex items-center gap-3 mb-3 flex-wrap shrink-0">
            <div onClick={() => startRef.current?.showPicker?.()} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 shadow-sm hover:border-primary transition-colors cursor-pointer select-none">
              <span className="text-sm text-gray-500">从</span>
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{startDate}</span>
              <Input ref={startRef} type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPreset(null); }} className="absolute opacity-0 pointer-events-none w-0 h-0" />
            </div>
            <span className="text-gray-500 text-sm">至</span>
            <div onClick={() => endRef.current?.showPicker?.()} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 shadow-sm hover:border-primary transition-colors cursor-pointer select-none">
              <span className="text-sm text-gray-500">至</span>
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{endDate}</span>
              <Input ref={endRef} type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPreset(null); }} className="absolute opacity-0 pointer-events-none w-0 h-0" />
            </div>
            <div className="flex gap-1 ml-2">
              <Button variant={preset === "default" ? "default" : "outline"} size="sm" onClick={() => applyPreset("default", 3, 4)} className="text-xs">默认</Button>
              <Button variant={preset === "week" ? "default" : "outline"} size="sm" onClick={() => applyPreset("week", 7, 0)} className="text-xs">这周</Button>
              <Button variant={preset === "month" ? "default" : "outline"} size="sm" onClick={() => applyPreset("month", today.getDate() - 1, getMonthEnd(today) - today.getDate())} className="text-xs">今月</Button>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
            <div className="lg:w-60 shrink-0 grid grid-cols-2 lg:grid-cols-1 gap-1.5 sm:gap-2 content-start max-sm:max-h-[40vh] max-sm:overflow-y-auto">
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2.5 border border-gray-200 dark:border-gray-600 shadow-sm">
                <p className="text-xs text-gray-500 dark:text-gray-400">用户总数</p>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100 count-up">{stats.totalUsers}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2.5 border border-gray-200 dark:border-gray-600 shadow-sm">
                <p className="text-xs text-gray-500 dark:text-gray-400">总余额</p>
                <p className="text-lg font-bold text-primary count-up">{formatAmount(stats.totalAmount)}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2.5 border border-gray-200 dark:border-gray-600 shadow-sm">
                <p className="text-xs text-gray-500 dark:text-gray-400">活跃用户</p>
                <p className="text-lg font-bold text-success count-up">{stats.activeUsers}</p>
              </div>
              <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 p-3 sm:p-4 flex flex-col justify-between min-h-[80px]">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm text-emerald-600 dark:text-emerald-400 font-bold shrink-0">↑</span>
                  <p className="text-xs sm:text-sm text-emerald-700 dark:text-emerald-300 font-medium truncate">今日充值</p>
                </div>
                <p className="text-lg sm:text-xl font-bold text-emerald-800 dark:text-emerald-200 truncate">{formatAmount(stats.todayRecharge)}</p>
              </div>
              <div className="rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/40 p-3 sm:p-4 flex flex-col justify-between min-h-[80px]">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm text-rose-600 dark:text-rose-400 font-bold shrink-0">↓</span>
                  <p className="text-xs sm:text-sm text-rose-700 dark:text-rose-300 font-medium truncate">今日消费</p>
                </div>
                <p className="text-lg sm:text-xl font-bold text-rose-800 dark:text-rose-200 truncate">{formatAmount(stats.todayConsumption)}</p>
              </div>
              <div className="rounded-2xl bg-sky-50 dark:bg-sky-950/30 border border-sky-100 dark:border-sky-900/40 p-3 sm:p-4 flex flex-col justify-between min-h-[80px]">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm text-sky-600 dark:text-sky-400 font-bold shrink-0">↑</span>
                  <p className="text-xs sm:text-sm text-sky-700 dark:text-sky-300 font-medium truncate">本周充值</p>
                </div>
                <p className="text-lg sm:text-xl font-bold text-sky-800 dark:text-sky-200 truncate">{formatAmount(stats.weekRecharge)}</p>
              </div>
            </div>

            <div className="flex-1 min-w-0 bg-white dark:bg-gray-800 rounded-2xl p-3 sm:p-4 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col min-h-0" style={{ minHeight: 320 }}>
              {hasTrendData ? (
                <div className="flex-1 min-h-0 overflow-hidden" style={{ minHeight: 300 }}>
                  <Line key={`${startDate}-${endDate}`} data={chartData} options={chartOptions} />
                </div>
              ) : (
                <div className="flex-1 min-h-0 flex items-center justify-center text-gray-400 dark:text-gray-500" style={{ minHeight: 300 }}>
                  <div className="text-center">
                    <p className="text-lg mb-1">📊</p>
                    <p className="text-sm">所选范围暂无数据</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
