import React, { useState, useRef, useEffect } from "react";
import { Plus, Minus, Star, MoreVertical, CreditCard, Trash2, Eye } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { User } from "@/types";
import { formatAmount, formatDate, getOperationText } from "@/lib/utils";

interface UserCardProps {
  user: User;
  onAddAmount: (userId: string) => void;
  onSubtractAmount: (userId: string) => void;
  onTogglePin: (userId: string) => void;
  onShowOptions: (userId: string) => void;
  onClick: (userId: string) => void;
}

export const UserCard = React.memo(function UserCard({
  user, onAddAmount, onSubtractAmount, onTogglePin, onShowOptions, onClick,
}: UserCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    onClick(user.id);
  };

  const isOldUser = user.id.startsWith("old-");
  const recentHistory = user.history.slice(-2).reverse();

  return (
    <div
      onClick={handleCardClick}
      className="relative bg-white dark:bg-dark rounded-2xl card-shadow hover-scale p-3 sm:p-5 cursor-pointer slide-up border border-gray-200 dark:border-gray-700 group transition-all duration-200"
    >
      {/* 三点菜单按钮 - 绝对定位右上角 */}
      <div className="absolute top-3 right-3" ref={menuRef}>
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
          className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-400 opacity-0 group-hover:opacity-100 focus:opacity-100"
        >
          <MoreVertical size={16} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-20 py-1">
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onClick(user.id); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <Eye size={14} /> 查看详情
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onShowOptions(user.id); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <Trash2 size={14} /> 删除用户
            </button>
          </div>
        )}
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-3 sm:mb-4 pr-6">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs sm:text-sm font-bold shrink-0">
            {(user.phone || user.tail).slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
                {user.phone || `尾号 ${user.tail}`}
                 {user.remark && <span className="text-sm font-normal text-gray-400 dark:text-gray-500 ml-1">{user.remark}</span>}
              </h3>
              {user.cardNo && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 shrink-0">
                  <CreditCard size={12} />{user.cardNo}
                </span>
              )}
            </div>
            {isOldUser && <p className="text-xs text-gray-500 dark:text-gray-400">旧用户</p>}
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">创建于{formatDate(user.created)}</p>
          </div>
        </div>
      </div>

      {/* Balance */}
      <div className="mb-3 sm:mb-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">当前余额</p>
        <p className="text-lg sm:text-2xl font-bold text-primary">{formatAmount(user.amount)}</p>
      </div>

      {/* Recent History — 始终渲染，无记录时显示占位 */}
      <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-100 dark:border-gray-700">
        <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">最近操作</h4>
        {recentHistory.length > 0 ? (
          <div className="space-y-2">
            {recentHistory.map(record => (
              <div key={record.id} className="flex items-center">
                <div className={`w-2 h-2 rounded-full mr-2 ${record.type === "add" ? "bg-success" : "bg-danger"}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-700 dark:text-gray-300">{getOperationText(record.type, record.amount)}</div>
                  {record.description && <div className="history-note truncate">{record.description}</div>}
                </div>
                <span className="text-xs text-gray-400 shrink-0 ml-2">{formatDate(record.date)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-400 dark:text-gray-500">暂无操作记录</p>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-1.5 sm:gap-2 mt-3 sm:mt-4">
        <Button variant="outline" size="sm" className="flex-1 gap-1 text-success border-success/20 hover:bg-success/5"
          onClick={(e) => { e.stopPropagation(); onAddAmount(user.id); }}>
          <Plus size={14} /> 充值
        </Button>
        <Button variant="outline" size="sm" className="flex-1 gap-1 text-danger border-danger/20 hover:bg-danger/5"
          onClick={(e) => { e.stopPropagation(); onSubtractAmount(user.id); }}>
          <Minus size={14} /> 消费
        </Button>
        <Button variant="outline" size="sm" className="gap-1"
          onClick={(e) => { e.stopPropagation(); onTogglePin(user.id); }}>
          <Star size={14} className={user.pinned ? "fill-warning text-warning" : ""} />
        </Button>
      </div>
    </div>
  );
});
