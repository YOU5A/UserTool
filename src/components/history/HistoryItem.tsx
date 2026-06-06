import { memo } from "react";
import { Pencil, Trash2, Plus, Minus } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { formatDate, getOperationText } from "@/lib/utils";
import type { HistoryRecord } from "@/types";

interface HistoryItemProps {
  record: HistoryRecord;
  userId: string;
}

export const HistoryItem = memo(function HistoryItem({ record, userId }: HistoryItemProps) {
  const store = useAppStore();
  const isAdd = record.type === "add";

  const handleEdit = () => {
    store.setCurrentUserId(userId);
    store.setCurrentHistoryId(record.id);
    store.openModal("editHistory");
  };

  const handleDelete = () => {
    store.setCurrentUserId(userId);
    store.setCurrentHistoryId(record.id);
    store.openModal("deleteHistory");
  };

  return (
    <div className="bg-white dark:bg-gray-700 rounded-lg border border-gray-100 dark:border-gray-600 p-4 shadow-sm history-item">
      <div className="flex items-center justify-between">
        <div className="flex items-center flex-1 min-w-0">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 flex-shrink-0 ${isAdd ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
            {isAdd ? <Plus size={14} /> : <Minus size={14} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {getOperationText(record.type, record.amount)}
            </p>
            {record.description && <p className="history-note truncate">{record.description}</p>}
            <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(record.date)}</p>
          </div>
        </div>
        <div className="flex space-x-1 ml-2 action-buttons">
          <button onClick={handleEdit} className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-300 transition-colors" title="编辑">
            <Pencil size={12} />
          </button>
          <button onClick={handleDelete} className="p-1.5 rounded-full hover:bg-danger/10 text-danger transition-colors" title="删除">
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
});
