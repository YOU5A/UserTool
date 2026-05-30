import { useRef, useState } from "react";
import { Sun, Moon, Download, Upload, DollarSign, Database, Palette, AlertTriangle, Trash2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { useAppStore } from "@/store/useAppStore";
import { useVIPManager } from "@/hooks/useVIPManager";
import { downloadJSON } from "@/lib/utils";

export function SettingsModal() {
  const store = useAppStore();
  const { mgr, rerender } = useVIPManager();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState("overwrite");
  const [importStatus, setImportStatus] = useState("");

  // 删除全部用户状态
  const [deleteAllStep, setDeleteAllStep] = useState(0); // 0=初始, 1=确认, 2=弹窗
  const [deleteAllInput, setDeleteAllInput] = useState("");
  const [deleteAllStatus, setDeleteAllStatus] = useState("");
  const [isShaking, setIsShaking] = useState(false);

  const onClose = () => {
    store.closeModal("settings");
    setImportStatus("");
    resetDeleteAll();
  };

  const resetDeleteAll = () => {
    setDeleteAllStep(0);
    setDeleteAllInput("");
    setDeleteAllStatus("");
    setIsShaking(false);
  };

  const handleFirstClick = () => {
    setDeleteAllStep(1);
  };

  const handleSecondClick = () => {
    setDeleteAllStep(2);
  };

  const handleConfirmDeleteAll = async () => {
    if (deleteAllInput !== "确认删除") {
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      return;
    }
    setDeleteAllStatus("删除中...");
    const count = await mgr.deleteAllUsers();
    setDeleteAllStatus(`已删除 ${count} 个用户`);
    rerender();
    // 1.5秒后自动关闭弹窗
    setTimeout(() => {
      resetDeleteAll();
    }, 1500);
  };

  const handleExport = () => {
    const payload = mgr.buildExportPayload();
    downloadJSON(payload, "vip-manager-backup-" + new Date().toISOString().slice(0, 10) + ".json");
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      const result = mgr.applyImport(raw, importMode as "overwrite" | "merge");
      setImportStatus("导入完成: " + result.usersImported + " 个用户");
      rerender();
    } catch (err) {
      setImportStatus("导入失败: " + err);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCurrencyChange = (newCurrency: string) => {
    store.setCurrency(newCurrency);
  };

  return (
    <Dialog open={store.modals.settings} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl" onClose={onClose}>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-5">设置</h2>
        <div className="space-y-4">
          {/* Theme */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-gray-50/50 dark:bg-gray-800/50">
            <div className="flex items-center gap-2 mb-3">
              <Palette size={18} className="text-primary" />
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">主题设置</h3>
            </div>
            <div className="flex gap-3">
              {[
                { key: "light", icon: Sun, label: "浅色模式" },
                { key: "dark", icon: Moon, label: "深色模式" },
              ].map(t => (
                <button key={t.key} onClick={() => store.setTheme(t.key as "light" | "dark")}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-lg border-2 transition-all flex-1 justify-center ${
                    store.theme === t.key
                      ? "border-primary bg-primary/5 text-primary font-medium"
                      : "border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500"
                  }`}>
                  <t.icon size={18} />
                  <span className="text-sm">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Currency */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-gray-50/50 dark:bg-gray-800/50">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign size={18} className="text-primary" />
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">货币单位</h3>
            </div>
            <div className="w-36">
              <Select value={store.currency} onValueChange={handleCurrencyChange}
                options={[{ value: "CNY", label: "\u00a5 CNY" }, { value: "USD", label: "$ USD" }]} />
            </div>
          </div>

          {/* Import / Export */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-gray-50/50 dark:bg-gray-800/50">
            <div className="flex items-center gap-2 mb-3">
              <Database size={18} className="text-primary" />
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">数据管理</h3>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={handleExport} className="gap-2">
                <Upload size={16} /> 导出数据
              </Button>
              <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2">
                <Download size={16} /> 导入数据
              </Button>
              <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
              <div className="w-32">
                <Select value={importMode} onValueChange={setImportMode}
                  options={[{ value: "overwrite", label: "覆盖模式" }, { value: "merge", label: "合并模式" }]} />
              </div>
            </div>
            {importStatus && <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{importStatus}</p>}
          </div>

          {/* Danger Zone */}
          <div className="rounded-xl border-2 border-danger/30 dark:border-danger/40 p-4 bg-danger/5 dark:bg-danger/10">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={18} className="text-danger" />
              <h3 className="text-sm font-semibold text-danger">危险区域</h3>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              此操作将永久删除所有用户数据，包括余额、历史记录、回收站和操作日志。建议先导出数据备份。
            </p>
            <div className="flex items-center gap-3">
              {deleteAllStep === 0 ? (
                <button
                  onClick={handleFirstClick}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-danger/40 text-danger hover:bg-danger hover:text-white transition-all duration-300 text-sm font-medium"
                >
                  <Trash2 size={16} />
                  一键删除所有用户
                </button>
              ) : deleteAllStep === 1 ? (
                <button
                  onClick={handleSecondClick}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-danger bg-danger text-white transition-all duration-300 text-sm font-medium animate-pulse-danger"
                >
                  <Trash2 size={16} className="animate-shake" />
                  确认删除
                </button>
              ) : null}
              {deleteAllStep > 0 && (
                <button
                  onClick={resetDeleteAll}
                  className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm"
                >
                  取消
                </button>
              )}
            </div>

          {/* 确认删除弹窗 */}
          {deleteAllStep === 2 && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50">
              <div className={`bg-white dark:bg-dark rounded-2xl w-full max-w-md shadow-2xl border-2 border-danger/40 dark:border-danger/50 ${isShaking ? "animate-shake" : ""}`}>
                {deleteAllStatus ? (
                  <div className="px-6 py-8 flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-success/15 flex items-center justify-center">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-success"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <span className="text-base font-semibold text-gray-900 dark:text-gray-100">{deleteAllStatus}</span>
                  </div>
                ) : (
                  <>
                    <div className="px-6 pt-6 pb-2">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-danger/15 flex items-center justify-center flex-shrink-0">
                          <AlertTriangle size={22} className="text-danger" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">确认删除全部用户</h3>
                          <p className="text-xs text-gray-500 dark:text-gray-400">此操作不可撤销</p>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                        请在下方输入 <span className="font-bold text-danger select-none">确认删除</span> 以继续：
                      </p>
                      <Input
                        value={deleteAllInput}
                        onChange={(e) => setDeleteAllInput(e.target.value)}
                        placeholder="请输入「确认删除」"
                        className={`text-center text-lg tracking-wider font-medium border-danger/30 focus:ring-danger/40 focus:border-danger ${
                          deleteAllInput === "确认删除"
                            ? "border-success ring-2 ring-success/30"
                            : deleteAllInput.length > 0
                              ? "border-danger/50"
                              : ""
                        }`}
                        autoFocus
                      />
                    </div>
                    <div className="px-6 pb-6 pt-4 flex gap-3 justify-end border-t border-gray-100 dark:border-gray-800 mt-4">
                      <Button variant="outline" onClick={() => { setDeleteAllStep(1); setDeleteAllInput(""); }}>
                        返回
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={handleConfirmDeleteAll}
                        disabled={deleteAllInput !== "确认删除"}
                        className={`gap-2 transition-all duration-300 ${
                          deleteAllInput === "确认删除"
                            ? "animate-pulse-danger"
                            : "opacity-50 cursor-not-allowed"
                        }`}
                      >
                        <Trash2 size={16} />
                        确认删除全部
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      </DialogContent>
    </Dialog>
  );
}