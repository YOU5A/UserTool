import { memo } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { useAppStore } from "@/store/useAppStore";
import { useVIPManager } from "@/hooks/useVIPManager";
import { formatDateTime } from "@/lib/utils";

export const TrashModal = memo(function TrashModal() {
  const store = useAppStore();
  const { mgr, rerender } = useVIPManager();
  const trashUsers = mgr.getTrashUsers();

  const onClose = () => { store.closeModal("trash"); store.setActiveView("users"); };

  const handleRestore = (id: string) => {
    mgr.restoreFromTrash(id);
    rerender();
  };

  const handlePurge = (id: string) => {
    if (!confirm("确定要彻底删除该用户吗？该操作不可恢复。")) return;
    mgr.purgeTrashItem(id);
    store.requestImmediatePush();
    rerender();
  };

  const handleClearAll = () => {
    if (!confirm("确定要清空回收站吗？该操作不可恢复。")) return;
    mgr.clearTrash();
    store.requestImmediatePush();
    rerender();
  };

  return (
    <Dialog open={store.modals.trash} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl" onClose={onClose}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">回收站 ({trashUsers.length})</h2>
          {trashUsers.length > 0 && (
            <Button variant="outline" size="sm" className="text-danger" onClick={handleClearAll}>
              <Trash2 size={14} className="mr-1" /> 清空
            </Button>
          )}
        </div>

        {trashUsers.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-8">回收站为空</p>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {trashUsers.map(u => (
              <div key={u.id} className="p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {u.phone || `尾号 ${u.tail}`}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      删除时间: {u._deletedAt ? formatDateTime(u._deletedAt) : "未知"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button size="sm" className="bg-success hover:bg-success/90" onClick={() => handleRestore(u.id)}>
                      恢复
                    </Button>
                    <Button size="sm" className="bg-danger hover:bg-danger/90" onClick={() => handlePurge(u.id)}>
                      彻底删除
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
});
