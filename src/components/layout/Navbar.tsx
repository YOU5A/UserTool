import { useState } from "react";
import { Search, PlusCircle, LogOut, LogIn, X, UserPlus, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";

interface NavbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onAddUser: () => void;
  isLoggedIn?: boolean;
  userEmail?: string;
  onLogout?: () => void;
}

export function Navbar({ searchQuery, onSearchChange, onAddUser, isLoggedIn, userEmail, onLogout }: NavbarProps) {
  const auth = useSupabaseAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [url, setUrl] = useState(localStorage.getItem("sb_project_url") || "");
  const [anonKey, setAnonKey] = useState(localStorage.getItem("sb_anon_key") || "");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSaveConfig = () => {
    setMsg("");
    if (!url || !anonKey) { setMsg("请填写 Project URL 和 Anon Key"); return; }
    auth.configureAndSave(url, anonKey);
    setMsg("配置已保存");
  };

  const handleSignIn = async () => {
    setMsg("");
    if (!email || !password) { setMsg("请填写邮箱和密码"); return; }
    setLoading(true);
    const { error } = await auth.signIn(email, password);
    setLoading(false);
    if (error) setMsg(error);
    else setShowLogin(false);
  };

  const handleSignUp = async () => {
    setMsg("");
    if (!email || !password) { setMsg("请填写邮箱和密码"); return; }
    setLoading(true);
    const { error } = await auth.signUp(email, password);
    setLoading(false);
    if (error) setMsg(error);
    else setMsg("注册成功！请到邮箱完成验证后登录。");
  };

  return (
    <nav className="bg-white dark:bg-dark shadow-sm z-20 border-b border-gray-200 dark:border-gray-700">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 gap-3">
          {/* Left: Brand */}
          <span className="text-base sm:text-lg font-bold whitespace-nowrap shrink-0">
            💵 <span className="bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">VIP Manager</span>
          </span>

          {/* Center: Search + Add */}
          <div className="flex items-center gap-2 sm:gap-3 flex-1 justify-center">
            <div className="relative max-w-xs w-full sm:w-56">
              <Input
                placeholder="搜索用户..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="!pl-9 !py-1.5 text-sm"
              />
              <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
            <Button onClick={onAddUser} size="default" className="gap-1.5 shrink-0">
              <PlusCircle size={16} />
              <span className="hidden sm:inline">添加用户</span>
            </Button>
          </div>

          {/* Right: Login or Logout */}
          <div className="flex items-center gap-2 shrink-0 relative">
            {isLoggedIn && userEmail ? (
              <>
                <span className="text-xs text-gray-500 dark:text-gray-400 hidden lg:inline truncate max-w-[120px]">{userEmail}</span>
                <button
                  onClick={onLogout}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  title="退出登录"
                >
                  <LogOut size={16} />
                </button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowLogin(!showLogin)}
                  className="gap-1 hidden md:inline-flex"
                >
                  <LogIn size={14} />
                  <span>登录</span>
                </Button>

                {/* Inline Login Panel */}
                {showLogin && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowLogin(false)} />
                    <div className="absolute right-0 top-full mt-2 z-50 w-96 bg-white dark:bg-dark rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 max-h-[88vh] overflow-y-auto">
                      <div className="flex items-start justify-between mb-4">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">登录以启用云端同步</h3>
                        <button onClick={() => setShowLogin(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                          <X size={20} />
                        </button>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">离线优先：登录一次后可以离线使用（会在恢复网络后同步）。</p>

                      {/* Supabase Config */}
                      <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Supabase 项目配置</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${auth.isConfigured ? "bg-success/10 text-success" : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200"}`}>
                            {auth.isConfigured ? "已配置" : "未配置"}
                          </span>
                        </div>
                        <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">Project URL</label>
                        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxxx.supabase.co" className="mb-3" />
                        <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">Anon Key (publishable)</label>
                        <Input value={anonKey} onChange={(e) => setAnonKey(e.target.value)} placeholder="eyJhbGciOiJIUzI1NiIs..." className="mb-3" />
                        <div className="flex gap-2">
                          <Button onClick={handleSaveConfig} className="flex-1">保存配置</Button>
                          <Button variant="outline" onClick={() => { auth.clearConfig(); setUrl(""); setAnonKey(""); setMsg("配置已清除"); }} className="flex-1">清除</Button>
                        </div>
                      </div>

                      {/* Login Form */}
                      <div className="space-y-3">
                        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="········" />
                        {msg && <p className={`text-sm ${msg.includes("失败") || msg.includes("错误") || msg.includes("Invalid") || msg.includes("请填写") ? "text-danger" : "text-success"}`}>{msg}</p>}
                        <div className="flex gap-2">
                          <Button onClick={handleSignIn} disabled={loading} className="flex-1 gap-1">
                            <LogIn size={16} /> 登录
                          </Button>
                          <Button variant="outline" onClick={handleSignUp} disabled={loading} className="flex-1 gap-1">
                            <UserPlus size={16} /> 注册
                          </Button>
                        </div>
                      </div>

                      {/* Skip */}
                      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <button
                          onClick={() => setShowLogin(false)}
                          className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors flex items-center justify-center gap-1"
                        >
                          <WifiOff size={14} /> 跳过同步，使用离线模式（本地数据）
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
