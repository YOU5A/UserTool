/**
 * Cookie-based auth storage for Supabase.
 * 替代默认的 localStorage，解决 Codex 内置浏览器等 WebView 环境下
 * localStorage 刷新后丢失导致登录态丢失的问题。
 */

const COOKIE_PREFIX = "sb-auth-";
const CFG_COOKIE_PREFIX = "sb-cfg-";

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

// ---- Config cookie helpers (exported for use in supabase.ts) ----

export function getConfigCookie(key: string): string | null {
  return getCookie(CFG_COOKIE_PREFIX + key);
}

export function setConfigCookie(key: string, value: string): void {
  setCookie(CFG_COOKIE_PREFIX + key, value, 365 * 24 * 60 * 60);
}

export function removeConfigCookie(key: string): void {
  removeCookie(CFG_COOKIE_PREFIX + key);
}

// ---- Supabase auth storage ----

export const cookieStorage = {
  getItem(key: string): Promise<string | null> {
    const cookieName = COOKIE_PREFIX + key;
    try {
      // localStorage 为主（更可靠，无 4KB 限制）
      try {
        const localValue = localStorage.getItem(key);
        if (localValue !== null) {
          // 同步修复 cookie 备份
          if (!getCookie(cookieName)) {
            setCookie(cookieName, localValue, 30 * 24 * 60 * 60);
          }
          return Promise.resolve(localValue);
        }
      } catch { /* ignore localStorage errors */ }
      // 回退 cookie
      const cookieValue = getCookie(cookieName);
      if (cookieValue !== null) return Promise.resolve(cookieValue);
      return Promise.resolve(null);
    } catch {
      return Promise.resolve(null);
    }
  },

  setItem(key: string, value: string): Promise<void> {
    const cookieName = COOKIE_PREFIX + key;
    try {
      // localStorage 为主（更可靠，无容量限制）
      try {
        localStorage.setItem(key, value);
      } catch { /* ignore localStorage errors */ }
      // cookie 作为备份
      try {
        setCookie(cookieName, value, 30 * 24 * 60 * 60);
      } catch { /* ignore cookie errors, localStorage already has it */ }
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
