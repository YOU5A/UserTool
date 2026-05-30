import { useState, useRef } from "react";
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
  return d.toISOString().slice(0, 10);
}

function getMonthEnd(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export function StatsModal() {
  const store = useAppStore();
  const { mgr } = useVIPManager();
  const today = new Date();
  const defaultStart = new Date(today); defaultStart.setDate(defaultStart.getDate() - 3);
  const defaultEnd = new Date(today); defaultEnd.setDate(defaultEnd.getDate() + 4);

  const [startDate, setStartDate] = useState(dateStr(defaultStart));
  const [endDate, setEndDate] = useState(dateStr(defaultEnd));
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);

  const onClose = () => { store.closeModal("stats"); store.setActiveView("users"); };
  const stats = mgr.getStatsData(startDate, endDate);

  const chartData = {
    labels: stats.consumptionTrend.map(d => d.date.slice(5)),
    datasets: [
      {
        label: "总余额", data: stats.consumptionTrend.map(d => d.balance), borderColor: "#165DFF", backgroundColor: "rgba(22,93,255,0.1)", fill: true, tension: 0.3, yAxisID: "y",
      },
      {
        label: "日消费", data: stats.consumptionTrend.map(d => d.amount), borderColor: "#F53F3F", backgroundColor: "rgba(245,63,63,0.1)", fill: true, tension: 0.3, yAxisID: "y1",
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index" as const, intersect: false },
    plugins: { legend: { position: "top" as const } },
    scales: {
      y: { type: "linear" as const, position: "left" as const, title: { display: true, text: "总余额" } },
      y1: { type: "linear" as const, position: "right" as const, title: { display: true, text: "日消费" }, grid: { drawOnChartArea: false } },
    },
  };

  const setPreset = (daysBack: number, daysForward: number) => {
    const s = new Date(today); s.setDate(s.getDate() - daysBack);
    const e = new Date(today); e.setDate(e.getDate() + daysForward);
    setStartDate(dateStr(s));
    setEndDate(dateStr(e));
  };

  return (
    <Dialog open={store.modals.stats} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="!max-w-[90rem] w-full !overflow-y-hidden" onClose={onClose}>
        <div className="flex flex-col" style={{ height: "calc(90vh - 6rem)" }}>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3 shrink-0">数据统计</h2>

          <div className="flex items-center gap-3 mb-3 flex-wrap shrink-0">
            <div onClick={() => startRef.current?.showPicker?.()} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 shadow-sm cursor-pointer hover:border-primary transition-colors select-none">
              <span className="text-sm text-gray-500">从</span>
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{startDate}</span>
              <Input ref={startRef} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="absolute opacity-0 pointer-events-none w-0 h-0" />
            </div>
            <span className="text-gray-500 text-sm">至</span>
            <div onClick={() => endRef.current?.showPicker?.()} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 shadow-sm cursor-pointer hover:border-primary transition-colors select-none">
              <span className="text-sm text-gray-500">至</span>
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{endDate}</span>
              <Input ref={endRef} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="absolute opacity-0 pointer-events-none w-0 h-0" />
            </div>
            <div className="flex gap-1 ml-2">
              <Button variant="outline" size="sm" onClick={() => setPreset(3, 4)} className="text-xs">默认</Button>
              <Button variant="outline" size="sm" onClick={() => setPreset(7, 0)} className="text-xs">这周</Button>
              <Button variant="outline" size="sm" onClick={() => setPreset(today.getDate() - 1, getMonthEnd(today) - today.getDate())} className="text-xs">今月</Button>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
            <div className="lg:w-60 shrink-0 grid grid-cols-2 lg:grid-cols-1 gap-2 content-start">
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
              <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-2.5 border border-emerald-200 dark:border-emerald-800 shadow-sm">
                <p className="text-xs text-emerald-600 dark:text-emerald-400">今日充值</p>
                <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{formatAmount(stats.todayRecharge)}</p>
              </div>
              <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-2.5 border border-orange-200 dark:border-orange-800 shadow-sm">
                <p className="text-xs text-orange-600 dark:text-orange-400">今日消费</p>
                <p className="text-lg font-bold text-orange-700 dark:text-orange-300">{formatAmount(stats.todayConsumption)}</p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2.5 border border-blue-200 dark:border-blue-800 shadow-sm">
                <p className="text-xs text-blue-600 dark:text-blue-400">本周充值</p>
                <p className="text-lg font-bold text-blue-700 dark:text-blue-300">{formatAmount(stats.weekRecharge)}</p>
              </div>
            </div>

            <div className="flex-1 min-w-0 bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col min-h-0">
              <div className="flex-1 min-h-0 overflow-hidden">
                <Line data={chartData} options={chartOptions} />
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}