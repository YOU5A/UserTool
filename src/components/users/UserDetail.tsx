import { useState, useMemo, useRef } from "react";
import { Plus, Minus, Star, User as UserIcon, ChevronDown, TrendingUp, TrendingDown, Calendar, Hash, Activity, Pencil, Check, X, CreditCard, } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { HistoryItem } from "@/components/history/HistoryItem";
import { useAppStore } from "@/store/useAppStore";
import { useVIPManager } from "@/hooks/useVIPManager";
import { formatAmount, formatDate, parseDate } from "@/lib/utils";

export function UserDetail() {
  const store = useAppStore();
  const { mgr, rerender } = useVIPManager();
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [editingRemark, setEditingRemark] = useState(false);
  const [editingCardNo, setEditingCardNo] = useState(false);
  const [remarkValue, setRemarkValue] = useState("");
  const [cardNoValue, setCardNoValue] = useState("");
  const [cardNoError, setCardNoError] = useState("");
  const [historyDateStart, setHistoryDateStart] = useState("");
  const [historyDateEnd, setHistoryDateEnd] = useState("");
  const dateStartRef = useRef<HTMLInputElement>(null);
  const dateEndRef = useRef<HTMLInputElement>(null);

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

  // 日期过滤后的历史记录
  // 日期范围过滤（使用 parseDate 正确处理时区）
  const filteredHistory = (historyDateStart || historyDateEnd)
    ? history.filter(r => {
        if (!r.date) return false;
        const pd = parseDate(r.date);
        if (!pd) return false;
        // 转为本地日期 YYYY-MM-DD 进行比较
        const y = pd.getFullYear();
        const m = String(pd.getMonth() + 1).padStart(2, "0");
        const day = String(pd.getDate()).padStart(2, "0");
        const d = `${y}-${m}-${day}`;
        if (historyDateStart && d < historyDateStart) return false;
        if (historyDateEnd && d > historyDateEnd) return false;
        return true;
      })
    : history;
  const visibleFilteredHistory = showAllHistory ? filteredHistory : filteredHistory.slice(0, 8);
  const hasMoreFiltered = filteredHistory.length > 8;

  return (
    <Dialog open={store.modals.userDetail} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="!max-w-[90rem] !overflow-y-hidden" onClose={onClose}>
        <div className="flex flex-col" style={{ height: "calc(90vh - 6rem)" }}>
          {/* 标题栏 */}
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3 shrink-0 flex items-center gap-3">
            用户详情: {displayName}
            {user.remark && <span className="text-sm font-normal text-gray-400 dark:text-gray-500">{user.remark}</span>}
          </h2>

          {/* 左右分栏 */}
          <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">

            {/* ====== 左栏：用户信息 + 统计 + 操作 ====== */}
            <div className="lg:w-[380px] shrink-0 overflow-y-auto space-y-4 pr-1 max-sm:max-h-[45vh]">

              {/* 用户头像与余额 */}
              <div className="flex items-center gap-4 p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-blue-400 flex items-center justify-center text-white shadow-lg shadow-primary/20 shrink-0">
                  <UserIcon size={24} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 flex-wrap">
                    <span className="flex items-center gap-1"><Hash size={14} /> 尾号: {user.tail}</span>
                    {user.cardNo && <span className="flex items-center gap-1"><CreditCard size={14} /> {user.cardNo}</span>}
                    <span className="flex items-center gap-1"><Calendar size={14} /> {user.created ? formatDate(user.created) : "未知"}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400">当前余额</p>
                  <p className="text-2xl font-bold text-primary">{formatAmount(user.amount)}</p>
                </div>
              </div>

              {/* 统计卡片 2x2 */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 p-3 flex flex-col justify-between min-h-[70px]">
                  <div className="flex items-center gap-1.5 mb-1">
                    <TrendingUp size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="text-xs text-emerald-700 dark:text-emerald-300 font-medium truncate">累计充值</span>
                  </div>
                  <p className="text-lg font-bold text-emerald-800 dark:text-emerald-200 truncate">{formatAmount(stats.totalRecharge)}</p>
                </div>
                <div className="rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/40 p-3 flex flex-col justify-between min-h-[70px]">
                  <div className="flex items-center gap-1.5 mb-1">
                    <TrendingDown size={14} className="text-rose-600 dark:text-rose-400 shrink-0" />
                    <span className="text-xs text-rose-700 dark:text-rose-300 font-medium truncate">累计消费</span>
                  </div>
                  <p className="text-lg font-bold text-rose-800 dark:text-rose-200 truncate">{formatAmount(stats.totalConsume)}</p>
                </div>
                <div className="rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-100 dark:border-sky-900/40 p-3 flex flex-col justify-between min-h-[70px]">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Activity size={14} className="text-sky-600 dark:text-sky-400 shrink-0" />
                    <span className="text-xs text-sky-700 dark:text-sky-300 font-medium truncate">操作次数</span>
                  </div>
                  <p className="text-lg font-bold text-sky-800 dark:text-sky-200 truncate">{stats.totalOps}</p>
                </div>
                <div className="rounded-xl bg-violet-50 dark:bg-violet-950/30 border border-violet-100 dark:border-violet-900/40 p-3 flex flex-col justify-between min-h-[70px]">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Calendar size={14} className="text-violet-600 dark:text-violet-400 shrink-0" />
                    <span className="text-xs text-violet-700 dark:text-violet-300 font-medium truncate">最近活跃</span>
                  </div>
                  <p className="text-sm font-semibold text-violet-800 dark:text-violet-200 truncate">
                    {stats.lastActivity ? formatDate(stats.lastActivity) : "暂无记录"}
                  </p>
                </div>
              </div>

              {/* 用户信息编辑 */}
              <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2">
                  <Pencil size={14} /> 用户信息
                </h3>
                <div className="space-y-3">
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

              {/* 快捷操作 */}
              <div className="flex flex-col gap-2">
                <Button className="w-full bg-success hover:bg-success/90 gap-2 py-3 shadow-sm shadow-success/20"
                  onClick={() => { store.openModal("addAmount"); }}>
                  <Plus size={18} /> 添加金额
                </Button>
                <Button className="w-full bg-danger hover:bg-danger/90 gap-2 py-3 shadow-sm shadow-danger/20"
                  onClick={() => { store.openModal("subtractAmount"); }}>
                  <Minus size={18} /> 减少金额
                </Button>
                <Button variant="outline" className="w-full gap-2 py-3"
                  onClick={() => { mgr.togglePin(userId); rerender(); }}>
                  <Star size={18} className={user.pinned ? "fill-warning text-warning" : ""} />
                  {user.pinned ? "取消置顶" : "置顶用户"}
                </Button>
              </div>

            </div>

            {/* ====== 右栏：消费记录 + 日期搜索 ====== */}
            <div className="flex-1 min-w-0 overflow-y-auto max-sm:min-h-[30vh] bg-white dark:bg-gray-800 rounded-2xl p-3 sm:p-4 border border-gray-200 dark:border-gray-700 shadow-sm">

              {/* 消费记录标题 + 日期搜索 */}
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h3 className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
                  <span className="w-1 h-4 bg-primary rounded-full" /> 消费记录
                  <span className="text-xs text-gray-400 font-normal">({filteredHistory.length} 条)</span>
                </h3>
                <div className="flex items-center gap-2 flex-wrap">
                  <div onClick={() => dateStartRef.current?.showPicker?.()} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 shadow-sm cursor-pointer hover:border-primary transition-colors select-none">
                    <span className="text-xs text-gray-500">从</span>
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                      {historyDateStart || "起始"
                    }</span>
                    <Input ref={dateStartRef} type="date" value={historyDateStart} onChange={(e) => setHistoryDateStart(e.target.value)} className="absolute opacity-0 pointer-events-none w-0 h-0" />
                  </div>
                  <span className="text-xs text-gray-500">至</span>
                  <div onClick={() => dateEndRef.current?.showPicker?.()} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 shadow-sm cursor-pointer hover:border-primary transition-colors select-none">
                    <span className="text-xs text-gray-500">至</span>
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                      {historyDateEnd || "结束"
                    }</span>
                    <Input ref={dateEndRef} type="date" value={historyDateEnd} onChange={(e) => setHistoryDateEnd(e.target.value)} className="absolute opacity-0 pointer-events-none w-0 h-0" />
                  </div>
                  {(historyDateStart || historyDateEnd) && (
                    <button onClick={() => { setHistoryDateStart(""); setHistoryDateEnd(""); }} className="p-1.5 rounded-lg text-gray-400 hover:text-danger hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="清除日期">
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* 历史记录列表 */}
              {filteredHistory.length === 0 ? (
                <div className="text-center py-12 text-gray-400 dark:text-gray-500">
                  <Activity size={40} className="mx-auto mb-3 opacity-50" />
                  <p className="text-sm">{(historyDateStart || historyDateEnd) ? "未找到匹配日期的记录" : "暂无消费记录"}</p>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {visibleFilteredHistory.map(record => (
                      <HistoryItem key={record.id} record={record} userId={userId} />
                    ))}
                  </div>
                  {hasMoreFiltered && !showAllHistory && (
                    <button onClick={() => setShowAllHistory(true)}
                      className="mt-4 w-full py-2.5 text-sm text-primary hover:bg-primary/5 rounded-xl transition-colors flex items-center justify-center gap-1">
                      查看全部 {filteredHistory.length} 条记录 <ChevronDown size={14} />
                    </button>
                  )}
                </>
              )}

            </div>

          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}