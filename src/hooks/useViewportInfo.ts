import { useState, useEffect } from "react";

interface ViewportInfo {
  /** 移动端（宽度 < 768px） */
  isMobile: boolean;
  /** 全屏模式（F11 全屏或窗口最大化） */
  isFullscreen: boolean;
}

function checkIsFullscreen(): boolean {
  // F11 浏览器全屏
  if (!!document.fullscreenElement) return true;
  // 窗口最大化：窗口尺寸接近屏幕可用区域
  if (
    window.outerWidth >= screen.availWidth - 2 &&
    window.outerHeight >= screen.availHeight - 2
  )
    return true;
  return false;
}

/**
 * 检测当前视口状态：移动端 / 全屏（含最大化） / 窗口模式
 */
export function useViewportInfo(): ViewportInfo {
  const [info, setInfo] = useState<ViewportInfo>(() => ({
    isMobile: typeof window !== "undefined" && window.innerWidth < 768,
    isFullscreen: typeof document !== "undefined" && checkIsFullscreen(),
  }));

  useEffect(() => {
    const check = () => {
      setInfo({
        isMobile: window.innerWidth < 768,
        isFullscreen: checkIsFullscreen(),
      });
    };

    window.addEventListener("resize", check);
    document.addEventListener("fullscreenchange", check);

    return () => {
      window.removeEventListener("resize", check);
      document.removeEventListener("fullscreenchange", check);
    };
  }, []);

  return info;
}
