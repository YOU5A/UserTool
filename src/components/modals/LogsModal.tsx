import { Trash2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useAppStore } from "@/store/useAppStore";
import { useVIPManager } from "@/hooks/useVIPManager";
import { useState, useMemo } from "react";

export function LogsModal() {
  const store = useAppStore();
  const { mgr, rerender } = useVIPManager();
  const [typeFilter, setTypeFilter] = useState("all");

  const logs = useMemo(() => {
    const allLogs = mgr.state.logs || [];
    if (typeFilter === "all") return allLogs;
    return allLogs.filter(l => l.type === typeFilter);
  }, [mgr.state.logs, typeFilter]);

  const logTypes = useMemo(() => {
    const types = new Set((mgr.state.logs || []).map(l => l.type).filter(Boolean));
    return [{ value: "all", label: "全部" }, ...Array.from(types).map(t => ({ value: t as string, label: t as string }))];
  }, [mgr.state.logs]);

  const onClose = () => { store.closeModal("logs"); store.setActiveView("users"); };

  const handleDeleteLog = (index: number) => {
    const actualIndex = mgr.state.logs.indexOf(logs[index]);
    if (actualIndex >= 0) {
      mgr.state.logs.splice(actualIndex, 1);
      rerender();
    }
  };

  const handleClearAll = () => {
    if (!confirm("确定要清空所有日志吗？此操作不可撤销。")) return;
    mgr.state.logs = [];
    rerender();
  };

  return (
    <Dialog open={store.modals.logs} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl" onClose={onClose}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">操作日志</h2>
          <div className="flex gap-2">
            <div className="w-32">
              <Select value={typeFilter} onValueChange={setTypeFilter} options={logTypes} />
            </div>
            <Button variant="outline" size="sm" className="text-danger" onClick={handleClearAll}>
              <Trash2 size={14} className="mr-1" /> 清空
            </Button>
          </div>
        </div>

        {logs.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-8">暂无日志</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {logs.map((log, i) => (
              <div key={i} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{log.type}</span>
                    <span className="text-xs text-gray-400">{log.timestamp ? new Date(log.timestamp).toLocaleString("zh-CN") : ""}</span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{log.message}</p>
                </div>
                <button onClick={() => handleDeleteLog(i)} className="p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 transition-colors shrink-0">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
