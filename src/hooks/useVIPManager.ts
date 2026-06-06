import { useState, useRef, useCallback } from "react";
import { createVIPManager, type VIPManagerInstance } from "@/lib/vip-manager";
import { useAppStore } from "@/store/useAppStore";

let instance: VIPManagerInstance | null = null;

function getInstance(): VIPManagerInstance {
  if (!instance) instance = createVIPManager();
  return instance;
}

export function useVIPManager() {
  const mgr = useRef(getInstance());
  const bumpDataVersion = useAppStore((s) => s.bumpDataVersion);
  const [, forceUpdate] = useState(0);
  const rerender = useCallback(() => {
    bumpDataVersion();
    forceUpdate((n) => n + 1);
  }, [bumpDataVersion]);

  return { mgr: mgr.current, rerender };
}

export { getInstance as getVIPManager };
