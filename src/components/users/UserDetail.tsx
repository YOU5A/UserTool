import { useState, useMemo } from "react";
import { Plus, Minus, Star, User as UserIcon, ChevronDown, TrendingUp, TrendingDown, Calendar, Hash, Activity, Pencil, Check, X, CreditCard } from "lucide-react";
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
  const [editingRemark, setEditingRemark] = useState(false);
  const [editingCardNo, setEditingCardNo] = useState(false);
  const [remarkValue, setRemarkValue] = useState("");
  const [cardNoValue, setCardNoValue] = useState("");
  const [cardNoError, setCardNoError] = useState("");

  const onClose = () => store.closeModal("userDetail");

  const startEditRemark = () => { setRemarkValue(user?.remark || ""); setEditingRemark(true); };
  const saveRemark = () => {
    if (userId && mgr.updateUserInfo(userId, { remark: remarkValue })) { rerender(); }
    setEditingRemark(false);
  };
  const startEditCardNo = () => { setCardNoValue(user?.cardNo || ""); setEditingCardNo(true); };
  const saveCardNo = () => {
    let normalized = cardNoValue.replace(/\D/g, "").slice(0, 4);
    if (normalized) normalized = normalized.padStart(4, "0");
    if (userId && mgr.updateUserInfo(userId, { cardNo: normalized })) {
      rerender();
      setEditingCardNo(false);
      setCardNoError("");
    } else {
      setCardNoError("卡号已存在或格式无效");
    }
  };

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
              <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{displayName}{user.remark && <span className="text-sm font-normal text-gray-400 dark:text-gray-500 ml-2">{user.remark}</span>}</h3>
              <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1"><Hash size={14} /> 尾号: {user.tail}</span>
                {user.cardNo && <span className="flex items-center gap-1"><CreditCard size={14} /> {user.cardNo}</span>}
                <span className="flex items-center gap-1"><Calendar size={14} /> 创建: {user.created ? formatDate(user.created) : "未知"}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 dark:text-gray-400">当前余额</p>
              <p className="text-3xl font-bold text-primary">{formatAmount(user.amount)}</p>
            </div>
          </div>

          {/* 用户信息编辑 */}
          <div className="mb-5 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2">
              <Pencil size={14} /> 用户信息
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 姓名 */}
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">姓名</label>
                {editingRemark ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={remarkValue}
                      onChange={(e) => setRemarkValue(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveRemark()}
                      className="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/50 text-gray-900 dark:text-gray-100"
                      placeholder="姓名"
                      autoFocus
                    />
                    <button onClick={saveRemark} className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/60 transition-colors"><Check size={16} /></button>
                    <button onClick={() => setEditingRemark(false)} className="p-2 rounded-lg bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"><X size={16} /></button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between px-3 py-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    <span className="text-sm text-gray-900 dark:text-gray-100">{user.remark || "未设置"}</span>
                    <button onClick={startEditRemark} className="text-gray-400 hover:text-primary transition-colors p-1"><Pencil size={14} /></button>
                  </div>
                )}
              </div>
              {/* 会员卡号 */}
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">会员卡号</label>
                {editingCardNo ? (
                  <><div className="flex items-center gap-2">
                    <input
                      value={cardNoValue}
                      onChange={(e) => { const d = e.target.value.replace(/\D/g, "").slice(0, 4); setCardNoValue(d); }}
                      onKeyDown={(e) => e.key === "Enter" && saveCardNo()}
                      className="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/50 text-gray-900 dark:text-gray-100"
                      placeholder="0001"
                      maxLength={4}
                      inputMode="numeric"
                      pattern="\d*"
                      autoFocus
                    />
                    <button onClick={saveCardNo} className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/60 transition-colors"><Check size={16} /></button>
                    <button onClick={() => { setEditingCardNo(false); setCardNoError(""); }} className="p-2 rounded-lg bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"><X size={16} /></button>
                  </div>
                  {cardNoError && <p className="text-danger text-xs mt-1">{cardNoError}</p>}
                  </>) : (
                  <div className="flex items-center justify-between px-3 py-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    <span className="text-sm text-gray-900 dark:text-gray-100">{user.cardNo || "未设置"}</span>
                    <button onClick={startEditCardNo} className="text-gray-400 hover:text-primary transition-colors p-1"><Pencil size={14} /></button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6">
            <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 p-4 sm:p-5 flex flex-col justify-between min-h-[90px]">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="text-xs sm:text-sm text-emerald-700 dark:text-emerald-300 font-medium truncate">累计充值</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-emerald-800 dark:text-emerald-200 truncate">{formatAmount(stats.totalRecharge)}</p>
            </div>
            <div className="rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/40 p-4 sm:p-5 flex flex-col justify-between min-h-[90px]">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown size={16} className="text-rose-600 dark:text-rose-400 shrink-0" />
                <span className="text-xs sm:text-sm text-rose-700 dark:text-rose-300 font-medium truncate">累计消费</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-rose-800 dark:text-rose-200 truncate">{formatAmount(stats.totalConsume)}</p>
            </div>
            <div className="rounded-2xl bg-sky-50 dark:bg-sky-950/30 border border-sky-100 dark:border-sky-900/40 p-4 sm:p-5 flex flex-col justify-between min-h-[90px]">
              <div className="flex items-center gap-2 mb-2">
                <Activity size={16} className="text-sky-600 dark:text-sky-400 shrink-0" />
                <span className="text-xs sm:text-sm text-sky-700 dark:text-sky-300 font-medium truncate">操作次数</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-sky-800 dark:text-sky-200 truncate">{stats.totalOps}</p>
            </div>
            <div className="rounded-2xl bg-violet-50 dark:bg-violet-950/30 border border-violet-100 dark:border-violet-900/40 p-4 sm:p-5 flex flex-col justify-between min-h-[90px]">
              <div className="flex items-center gap-2 mb-2">
                <Calendar size={16} className="text-violet-600 dark:text-violet-400 shrink-0" />
                <span className="text-xs sm:text-sm text-violet-700 dark:text-violet-300 font-medium truncate">最近活跃</span>
              </div>
              <p className="text-sm sm:text-base font-semibold text-violet-800 dark:text-violet-200 truncate">
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
