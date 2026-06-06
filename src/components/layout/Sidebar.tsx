import { memo } from "react";
import { RefreshCw, Settings, Users, BarChart2, Trash2, FileText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAppStore } from "@/store/useAppStore";
import { useVIPManager } from "@/hooks/useVIPManager";
import { formatAmount } from "@/lib/utils";

interface SidebarProps {
  onRefresh: () => void;
  onSettings: () => void;
  onUserClick: (userId: string) => void;
  onClearRecent: () => void;
}

export const Sidebar = memo(function Sidebar({ onRefresh, onSettings, onUserClick, onClearRecent }: SidebarProps) {
  const { activeView, setActiveView } = useAppStore();
  const dataVersion = useAppStore((s) => s.dataVersion);
  const { mgr } = useVIPManager();
  const recentUsers = mgr.getRecentUsers();

  const links = [
    { id: "users" as const, icon: Users, label: "所有用户" },
    { id: "stats" as const, icon: BarChart2, label: "数据统计" },
    { id: "trash" as const, icon: Trash2, label: "回收站" },
    { id: "logs" as const, icon: FileText, label: "操作日志" },
  ];

  return (
    <aside className="w-64 bg-white dark:bg-dark shadow-md ring-1 ring-gray-200 dark:ring-0 flex-shrink-0 hidden md:block">
      <div className="py-6 px-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">用户管理</h2>
          <div className="flex space-x-2">
            <button onClick={onRefresh} className="p-1.5 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
              <RefreshCw size={16} className="text-gray-500 dark:text-gray-300" />
            </button>
            <button onClick={onSettings} className="p-1.5 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
              <Settings size={16} className="text-gray-500 dark:text-gray-300" />
            </button>
          </div>
        </div>

        {/* Recent Users */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">最近浏览</h3>
            <button onClick={onClearRecent} className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              清空
            </button>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {recentUsers.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm">暂无浏览记录</p>
            ) : (
              recentUsers.map(user => (
                <button
                  key={user.id}
                  onClick={() => onUserClick(user.id)}
                  className="flex items-center p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors w-full text-left"
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${user.pinned ? "bg-primary/10 text-primary" : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300"}`}>
                    <Users size={14} />
                  </div>
                  <div className="ml-3 min-w-0">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-100 truncate">{user.phone || `尾号 ${user.tail}`}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">余额: {formatAmount(user.amount)}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Navigation Links */}
        <div>
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">常用功能</h3>
          <div className="space-y-1">
            {links.map(link => (
              <button
                key={link.id}
                onClick={() => setActiveView(link.id)}
                className={`flex items-center p-2 rounded-lg w-full text-left transition-colors ${
                  activeView === link.id
                    ? "bg-primary/5 text-primary nav-active relative"
                    : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                }`}
              >
                <link.icon size={18} className="w-5 h-5 text-center shrink-0" />
                <span className="ml-3">{link.label}</span>
                <span className="nav-indicator" />
              </button>
            ))}
            <button
              onClick={onSettings}
              className="flex items-center p-2 rounded-lg w-full text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
            >
              <Settings size={18} className="w-5 h-5 text-center shrink-0" />
              <span className="ml-3">设置</span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
});