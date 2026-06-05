import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, ChevronFirst, ChevronLast, Filter } from "lucide-react";
import { UserCard } from "./UserCard";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useAppStore } from "@/store/useAppStore";
import { useVIPManager } from "@/hooks/useVIPManager";
import { useDebounce } from "@/hooks/useDebounce";
import type { User } from "@/types";

/** 卡片最小宽度（与 CSS auto-fill minmax 对齐） */
const CARD_MIN_W = 260;
/** 卡片估算高度（含内边距和历史记录） */
const CARD_EST_H = 280;
/** 网格间距 */
const GAP = 16;
/** 固定 chrome 高度：导航栏(56) + 主区域上下内边距(48) + 筛选栏(40) + 分页栏(64) + 页脚(40) */
const CHROME_H = 248;

function calcCols(containerWidth: number): number {
  return Math.max(1, Math.floor((containerWidth + GAP) / (CARD_MIN_W + GAP)));
}

function calcRows(): number {
  const availableH = window.innerHeight - CHROME_H;
  return Math.max(1, Math.floor((availableH + GAP) / (CARD_EST_H + GAP)));
}

export function UserGrid() {
  const store = useAppStore();
  const { mgr, rerender } = useVIPManager();
  const debouncedSearch = useDebounce(store.searchQuery, 300);
  const dataVersion = useAppStore((s) => s.dataVersion);

  // 网格容器 Ref + 尺寸监听
  const gridRef = useRef<HTMLDivElement>(null);
  const [gridDims, setGridDims] = useState({ cols: 1, rows: 1 });

  const updateDims = useCallback(() => {
    const el = gridRef.current;
    if (!el) return;
    const cols = calcCols(el.clientWidth);
    const rows = calcRows();
    setGridDims((prev) => (prev.cols === cols && prev.rows === rows ? prev : { cols, rows }));
  }, []);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    updateDims();
    const ro = new ResizeObserver(() => updateDims());
    ro.observe(el);
    window.addEventListener("resize", updateDims);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateDims);
    };
  }, [updateDims, dataVersion]);

  // Filter and search
  const filteredUsers = useMemo(() => {
    let users: User[];
    if (store.activeFilter !== "all") {
      users = mgr.filterUsers(store.activeFilter);
    } else {
      users = mgr.getAllUsers();
    }
    if (debouncedSearch) {
      users = mgr.searchUsers(debouncedSearch);
    }
    return users;
  }, [mgr, store.activeFilter, debouncedSearch, dataVersion]);

  // 动态计算每页数量
  const effectivePerPage = useMemo(() => {
    return gridDims.cols * gridDims.rows;
  }, [gridDims]);

  // Pagination
  const totalPages = Math.ceil(filteredUsers.length / effectivePerPage);
  const safePage = Math.min(store.currentPage, Math.max(1, totalPages));
  const startIdx = (safePage - 1) * effectivePerPage;
  const endIdx = Math.min(startIdx + effectivePerPage, filteredUsers.length);
  const currentPageUsers = filteredUsers.slice(startIdx, endIdx);

  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, safePage - Math.floor(maxVisible / 2));
    const end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }, [totalPages, safePage]);

  // Handlers
  const handleAddAmount = (userId: string) => {
    store.setCurrentUserId(userId);
    store.openModal("addAmount");
  };
  const handleSubtractAmount = (userId: string) => {
    store.setCurrentUserId(userId);
    store.openModal("subtractAmount");
  };
  const handleTogglePin = (userId: string) => {
    mgr.togglePin(userId);
    rerender();
  };
  const handleShowOptions = (userId: string) => {
    store.setCurrentUserId(userId);
    store.openModal("deleteUser");
  };
  const handleUserClick = (userId: string) => {
    store.setCurrentUserId(userId);
    mgr.addRecentView(userId);
    store.openModal("userDetail");
  };
  const handlePageChange = (page: number) => { store.setCurrentPage(page); };

  const [jumpPage, setJumpPage] = useState("");
  const handleJump = () => {
    const p = parseInt(jumpPage, 10);
    if (p >= 1 && p <= totalPages) {
      handlePageChange(p);
      setJumpPage("");
    }
  };

  const filterOptions = [
    { value: "all", label: "全部用户" },
    { value: "pinned", label: "置顶用户" },
    { value: "card", label: "会员卡号" },
    { value: "high", label: "高余额 (>300)" },
    { value: "medium", label: "中等余额 (100-300)" },
    { value: "low", label: "低余额 (<100)" },
  ];

  return (
    <div>
      {/* Filter Bar */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          共找到 {filteredUsers.length} 个 VIP 用户
        </p>
        <div className="w-44">
          <Select
            value={store.activeFilter}
            onValueChange={(v) => store.setActiveFilter(v)}
            options={filterOptions}
          />
        </div>
      </div>

      {/* User Cards */}
      {filteredUsers.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-gray-500 dark:text-gray-400 text-lg mb-4">暂无用户</p>
          <Button onClick={() => store.openModal("addUser")}>添加第一个用户</Button>
        </div>
      ) : (
        <div ref={gridRef} className="grid gap-3 sm:gap-4 grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
          {currentPageUsers.map(user => (
            <UserCard
              key={user.id}
              user={user}
              onAddAmount={handleAddAmount}
              onSubtractAmount={handleSubtractAmount}
              onTogglePin={handleTogglePin}
              onShowOptions={handleShowOptions}
              onClick={handleUserClick}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-between">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            显示 {startIdx + 1} 到 {endIdx}，共 {filteredUsers.length} 条
          </div>
          <div className="flex items-center space-x-1">
            <Button
              variant="outline"
              size="icon"
              disabled={safePage === 1}
              onClick={() => handlePageChange(1)}
              title="首页"
            >
              <ChevronFirst size={18} />
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={safePage === 1}
              onClick={() => handlePageChange(safePage - 1)}
            >
              <ChevronLeft size={18} />
            </Button>
            {pageNumbers.map(p => (
              <Button
                key={p}
                variant={p === safePage ? "default" : "outline"}
                size="icon"
                onClick={() => handlePageChange(p)}
              >
                {p}
              </Button>
            ))}
            <Button
              variant="outline"
              size="icon"
              disabled={safePage === totalPages}
              onClick={() => handlePageChange(safePage + 1)}
            >
              <ChevronRight size={18} />
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={safePage === totalPages}
              onClick={() => handlePageChange(totalPages)}
              title="末页"
            >
              <ChevronLast size={18} />
            </Button>
            <span className="text-sm text-gray-500 dark:text-gray-400 mx-1">跳至</span>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={jumpPage}
              onChange={(e) => setJumpPage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleJump()}
              className="w-14 h-9 text-center text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder={`1-${totalPages}`}
            />
            <Button variant="outline" size="sm" onClick={handleJump} className="text-xs">GO</Button>
          </div>
        </div>
      )}
    </div>
  );
}
