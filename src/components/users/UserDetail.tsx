import { useState, useMemo } from "react";
import { Plus, Minus, Star, User as UserIcon, ChevronDown, TrendingUp, TrendingDown, Calendar, Hash, Activity } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { HistoryItem } from "@/components/history/HistoryItem";
import { useAppStore } from "@/store/useAppStore";
import { useVIPManager } from "@/hooks/useVIPManager";
import { formatAmount, formatDate } from "@/lib/utils";

export function UserDetail() {
  const store = useAppStore();
  const { mgr, rerender } = useVIPManager();
  const [showAllHistory, setShowAllHistory] = useState(false);

  const onClose = () => store.closeModal("userDetail");

  // 所有数据获取必须在 hooks 之前声明，避免条件返回导致的 hooks 数量不一致
  const userId = store.currentUserId;
  const user = userId ? mgr.getUser(userId) : undefined;
  const history = Array.isArray(user?.history) ? user.history : [];
  const displayName = user ? (user.phone || `尾号 ${user.tail}`) : "";
  const visibleHistory = showAllHistory ? history : history.slice(0, 8);
  const hasMore = history.length > 8;

  // 所有 hooks 必须在此处（条件返回之前）调用
  const stats = useMemo(() => {
    let totalRecharge = 0;
    let totalConsume = 0;
    history.forEach(h => {
      if (h && h.type === "add") totalRecharge += h.amount || 0;
      else if (h) totalConsume += h.amount || 0;
    });
    const lastActivity = history.length > 0
      ? history[history.length - 1].date
      : null;
    return { totalRecharge, totalConsume, lastActivity, totalOps: history.length };
  }, [history]);

  // 条件返回必须放在所有 hooks 之后
  if (!userId || !user) return null;

  return (
    <Dialog open={store.modals.userDetail} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl" onClose={onClose}>
        <div>
          {/* User Info Header */}
          <div className="flex items-center gap-4 pb-4 mb-5 border-b border-gray-200 dark:border-gray-700">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-blue-400 flex items-center justify-center text-white shadow-lg shadow-primary/20">
              <UserIcon size={28} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{displayName}</h3>
              <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1"><Hash size={14} /> 尾号: {user.tail}</span>
                <span className="flex items-center gap-1"><Calendar size={14} /> 创建: {user.created ? formatDate(user.created) : "未知"}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 dark:text-gray-400">当前余额</p>
              <p className="text-3xl font-bold text-primary">{formatAmount(user.amount)}</p>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-4 border border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={16} className="text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">累计充值</span>
              </div>
              <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{formatAmount(stats.totalRecharge)}</p>
            </div>
            <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-4 border border-orange-200 dark:border-orange-800">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown size={16} className="text-orange-600 dark:text-orange-400" />
                <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">累计消费</span>
              </div>
              <p className="text-lg font-bold text-orange-700 dark:text-orange-300">{formatAmount(stats.totalConsume)}</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-1">
                <Activity size={16} className="text-blue-600 dark:text-blue-400" />
                <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">操作次数</span>
              </div>
              <p className="text-lg font-bold text-blue-700 dark:text-blue-300">{stats.totalOps}</p>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 border border-purple-200 dark:border-purple-800">
              <div className="flex items-center gap-2 mb-1">
                <Calendar size={16} className="text-purple-600 dark:text-purple-400" />
                <span className="text-xs text-purple-600 dark:text-purple-400 font-medium">最近活跃</span>
              </div>
              <p className="text-sm font-bold text-purple-700 dark:text-purple-300">
                {stats.lastActivity ? formatDate(stats.lastActivity) : "暂无记录"}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2">
              <span className="w-1 h-4 bg-primary rounded-full" /> 快捷操作
            </h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button className="flex-1 bg-success hover:bg-success/90 gap-2 py-3 shadow-sm shadow-success/20"
                onClick={() => { store.openModal("addAmount"); }}>
                <Plus size={18} /> 添加金额
              </Button>
              <Button className="flex-1 bg-danger hover:bg-danger/90 gap-2 py-3 shadow-sm shadow-danger/20"
                onClick={() => { store.openModal("subtractAmount"); }}>
                <Minus size={18} /> 减少金额
              </Button>
              <Button variant="outline" className="flex-1 gap-2 py-3"
                onClick={() => { mgr.togglePin(userId); rerender(); }}>
                <Star size={18} className={user.pinned ? "fill-warning text-warning" : ""} />
                {user.pinned ? "取消置顶" : "置顶用户"}
              </Button>
            </div>
          </div>

          {/* History */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2">
              <span className="w-1 h-4 bg-primary rounded-full" /> 消费记录
              <span className="text-xs text-gray-400 font-normal ml-1">({history.length} 条)</span>
            </h3>
            {history.length === 0 ? (
              <div className="text-center py-8 text-gray-400 dark:text-gray-500">
                <Activity size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">暂无消费记录</p>
              </div>
            ) : (
              <>
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {visibleHistory.map(record => (
                    <HistoryItem key={record.id} record={record} userId={userId} />
                  ))}
                </div>
                {hasMore && !showAllHistory && (
                  <button onClick={() => setShowAllHistory(true)}
                    className="mt-4 w-full py-2.5 text-sm text-primary hover:bg-primary/5 rounded-xl transition-colors flex items-center justify-center gap-1">
                    查看全部 {history.length} 条记录 <ChevronDown size={14} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
