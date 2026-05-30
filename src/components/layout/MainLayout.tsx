import { ReactNode, useState } from "react";
import { Menu, X, Users, Star, BarChart2, Trash2, FileText, Settings, Sun, Moon } from "lucide-react";
import { Navbar } from "./Navbar";
import { Sidebar } from "./Sidebar";
import { useAppStore } from "@/store/useAppStore";

interface MainLayoutProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onAddUser: () => void;
  onRefresh: () => void;
  onSettings: () => void;
  onUserClick: (userId: string) => void;
  onClearRecent: () => void;
  isLoggedIn?: boolean;
  userEmail?: string;
  onLogout?: () => void;
  children: ReactNode;
}

const mobileLinks = [
  { id: "users" as const, icon: Users, label: "所有用户" },
  { id: "pinned" as const, icon: Star, label: "置顶用户" },
  { id: "stats" as const, icon: BarChart2, label: "数据统计" },
  { id: "trash" as const, icon: Trash2, label: "回收站" },
  { id: "logs" as const, icon: FileText, label: "操作日志" },
];

export function MainLayout({
  searchQuery, onSearchChange, onAddUser, onRefresh, onSettings,
  onUserClick, onClearRecent, isLoggedIn, userEmail, onLogout, children,
}: MainLayoutProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { activeView, setActiveView, theme, setTheme } = useAppStore();

  const handleNavClick = (id: typeof activeView) => {
    setActiveView(id);
    setMobileNavOpen(false);
  };

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      <Navbar
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        onAddUser={onAddUser}
        isLoggedIn={isLoggedIn}
        userEmail={userEmail}
        onLogout={onLogout}
      />
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar */}
        <Sidebar
          onRefresh={onRefresh}
          onSettings={onSettings}
          onUserClick={onUserClick}
          onClearRecent={onClearRecent}
        />
        {/* Mobile Bottom Sheet Menu */}
        {mobileNavOpen && (
          <>
            <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setMobileNavOpen(false)} />
            <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white dark:bg-dark rounded-t-2xl shadow-2xl border-t border-gray-200 dark:border-gray-700 animate-slide-up">
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
              </div>
              <div className="px-4 pb-6">
                <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 px-2">常用功能</h3>
                <div className="space-y-1">
                  {mobileLinks.map(link => (
                    <button
                      key={link.id}
                      onClick={() => handleNavClick(link.id)}
                      className={`flex items-center gap-3 p-3 rounded-xl w-full text-left transition-colors ${
                        activeView === link.id
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      <link.icon size={20} />
                      <span className="font-medium">{link.label}</span>
                    </button>
                  ))}
                </div>

                {/* Divider */}
                <div className="my-3 border-t border-gray-100 dark:border-gray-700" />

                {/* Settings & Theme */}
                <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 px-2">设置</h3>
                <button
                  onClick={() => { onSettings(); setMobileNavOpen(false); }}
                  className="flex items-center gap-3 p-3 rounded-xl w-full text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <Settings size={20} />
                  <span className="font-medium">打开设置</span>
                </button>
                <button
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className="flex items-center gap-3 p-3 rounded-xl w-full text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
                  <span className="font-medium">{theme === "dark" ? "浅色模式" : "深色模式"}</span>
                </button>
              </div>
            </div>
          </>
        )}
        <main className="flex-1 overflow-y-auto">
          <div className="px-4 sm:px-6 lg:px-8 py-6">
            {children}
          </div>
        </main>
      </div>
      {/* Mobile Floating Nav Button */}
      <button
        onClick={() => setMobileNavOpen(true)}
        className="fixed bottom-5 right-5 z-30 w-12 h-12 rounded-full bg-primary text-white shadow-lg hover:bg-primary/90 transition-all flex items-center justify-center md:hidden"
        aria-label="打开导航菜单"
      >
        {mobileNavOpen ? <X size={22} /> : <Menu size={22} />}
      </button>
      <footer className="border-t border-gray-200 dark:border-gray-700/50">
        <div className="px-4 py-3 text-center text-xs text-gray-400 dark:text-gray-500">
          &copy; pfmaxlnx@gmail.com 2019&ndash;2026 All rights reserved.
        </div>
      </footer>
    </div>
  );
}
