/**
 * Cookie-based auth storage for Supabase.
 * 替代默认的 localStorage，解决 Codex 内置浏览器等 WebView 环境下
 * localStorage 刷新后丢失导致登录态丢失的问题。
 */

const COOKIE_PREFIX = "sb-auth-";

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/([.$?*|{}()\[\]\\\/+^])/g, "\\$1") + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string, maxAgeSec: number): void {
  // max-age in seconds, path=/ ensures it's available on all paths
  document.cookie = `${name}=${encodeURIComponent(value)};max-age=${maxAgeSec};path=/;SameSite=Lax`;
}

function removeCookie(name: string): void {
  // Set expiry in the past to delete
  document.cookie = `${name}=;max-age=0;path=/;SameSite=Lax`;
}

export const cookieStorage = {
  getItem(key: string): Promise<string | null> {
    // key 形如 "sb-xxxxx-auth-token"，我们用 cookie 前缀简化
    const cookieName = COOKIE_PREFIX + key;
    try {
      const value = getCookie(cookieName);
      return Promise.resolve(value);
    } catch {
      return Promise.resolve(null);
    }
  },

  setItem(key: string, value: string): Promise<void> {
    const cookieName = COOKIE_PREFIX + key;
    try {
      // Supabase session token 默认过期时间很长（refresh token 可能有 30 天）
      // 设置 cookie 30 天过期
      setCookie(cookieName, value, 30 * 24 * 60 * 60);
      // 同时写一份到 localStorage 做双重保障
      try {
        localStorage.setItem(key, value);
      } catch { /* ignore localStorage errors */ }
      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e);
    }
  },

  removeItem(key: string): Promise<void> {
    const cookieName = COOKIE_PREFIX + key;
    try {
      removeCookie(cookieName);
      try {
        localStorage.removeItem(key);
      } catch { /* ignore */ }
      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e);
    }
  },
};
