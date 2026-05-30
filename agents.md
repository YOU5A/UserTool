# AGENTS.md — VIP用户管理系统 v2.0.0

## 项目概述

React SPA，管理VIP会员的余额充值、消费扣减、统计、导入导出、云端同步。

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | React 18.3 |
| 类型系统 | TypeScript 5.7（strict: true，target: ES2020） |
| 构建工具 | Vite 6.2 + @vitejs/plugin-react |
| 样式 | Tailwind CSS 4 + @tailwindcss/vite |
| UI 库 | Radix UI（dialog/select/switch/checkbox/tabs/label/separator/slot） |
| 状态管理 | zustand 5（仅 UI 状态，业务状态在 VIPManager 内存） |
| 本地存储 | Dexie 4（IndexedDB） |
| 云后端 | Supabase（Auth + Database + Realtime） |
| 图表/图标 | chart.js + react-chartjs-2 / lucide-react |
| 工具 | clsx + tailwind-merge + class-variance-authority |

## 编码规范

- **编码**：UTF-8，交互语言中文
- **路径别名**：`@/` → `src/`（tsconfig paths + vite alias 双重配置）
- **TypeScript**：strict: true，所有类型定义集中在 `src/types/index.ts`
- **命名**：组件文件 PascalCase / Hook & 工具文件 camelCase / 类型 `export interface`
- **组件**：全部函数组件 + Hooks，仅 `ErrorBoundary` 是类组件（**禁止改为函数组件**）

## 项目结构

```
vip-manager/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
├── public/
└── src/
    ├── main.tsx                  # React 入口
    ├── App.tsx                   # 根组件：视图路由、Modal 管理、初始化
    ├── index.css                 # Tailwind + 自定义动画/滚动条
    ├── vite-env.d.ts             # 【禁止修改】
    ├── types/index.ts            # 所有类型定义
    ├── lib/
    │   ├── vip-manager.ts        # 核心业务引擎（VIPManager 工厂）
    │   ├── db.ts                 # Dexie schema（当前 v2，修改递增版本号）
    │   ├── supabase.ts           # Supabase 客户端
    │   ├── auth-storage.ts       # Supabase 认证配置持久化
    │   └── utils.ts              # 格式化/货币/导出等工具函数
    ├── store/useAppStore.ts      # Zustand UI 状态
    ├── hooks/
    │   ├── useVIPManager.ts      # VIPManager 模块级单例
    │   ├── useSupabaseAuth.ts    # 认证 + 自动同步 + Realtime
    │   ├── useViewportInfo.ts    # isMobile / isFullscreen
    │   └── useDebounce.ts
    └── components/
        ├── ui/                   # Button / Dialog / Input / Select / ErrorBoundary
        ├── layout/               # MainLayout / Sidebar / Navbar
        ├── users/                # UserGrid / UserCard / UserDetail / UserForm
        ├── modals/               # Amount / EditDelete / Stats / Settings / Trash / Logs
        └── history/              # HistoryItem
```

---

## 核心架构：离线优先 + 云端同步

### 数据流

```
用户操作 → VIPManager 方法（内存 state）
           ├── 更新 state.users[id]
           ├── 加入 dirtyUpserts / outboxMap
           ├── addLog()
           └── scheduleSave() → Dexie 批量 flush（users + meta + outbox）
                  ↓
            dataVersion 变更 → 3s 防抖 → syncPushToCloud()
                  ↓
            Supabase user_data 表（条件推送：本地 __ts > 远程 updated_at 才写入）
```

### VIPManager（`src/lib/vip-manager.ts`）

通过 `createVIPManager()` 工厂创建，`useVIPManager` Hook 维护模块级单例。

**关键方法**：
- `init(userId)` → `loadData()` → IndexedDB 加载到内存
- `addNewUser(phone, amount)` — 11位手机号，`id=phone, tail=phone.slice(-4)`
- `addOldUser(tail, amount)` — 4位尾号，`id="old-{tail}"`
- `addAmount / subtractAmount` — 充值/消费（余额不足返回 false）
- `deleteUser` → 软删除（`deleted=true`，进 trash[]）
- `restoreFromTrash / purgeTrashItem / clearTrash`
- `editHistory / deleteHistory` — 自动重算用户余额
- `exportPayload / importData` — overwrite 或 merge，自动货币转换
- `syncPushToCloud / syncPullFromCloud`

### 数据库（`src/lib/db.ts`）

Dexie，按用户ID分库 `vip_manager_{userId}`，schema v2：

| 表 | 主键 | 内容 |
|----|------|------|
| `users` | `id` | phone, tail, pinned, amount, created |
| `meta` | `key` | recentViewed, trash, logs, sync_state |
| `outbox` | `key` | type, user_id, ts |

### 同步机制

- **Push**：dataVersion 变更 → 3s 防抖 → 逐条 outbox 推送
- **Pull**：登录初始化 / window focus / Realtime 收到变更 → 分页拉取（1000条/页），比较 `__ts` 取最新
- **Realtime**：Supabase channel `user_data_changes` 监听 INSERT/UPDATE/DELETE

### 状态管理（二层分离）

| 层 | 位置 | 内容 |
|----|------|------|
| UI 状态 | zustand `useAppStore` | searchQuery, activeFilter, currentPage, usersPerPage, theme, currency, activeView, modals（11个开关）, dataVersion |
| 业务状态 | `VIPManager.state` | users, recentViewed, trash, logs, syncState |

### 初始化流程

```
App mount → useSupabaseAuth
  ├── 已配 Supabase + 已登录 → mgr.init(userId) → doPull → setupRealtime
  ├── 已配 Supabase + 未登录 → mgr.init("local_offline")
  └── 未配 Supabase → mgr.init("local_offline") 纯离线
```

### 登出

登出后 → 清空内存数据 → `mgr.init("local_offline")` → 重渲染

---

## 关键业务规则

- **新用户**：11位手机号，`id=phone`；**旧用户**：4位尾号，`id="old-{tail}"`，添加时自动排重
- **软删除**：`deleteUser` → `deleted=true` + `_deletedAt` → 移入 trash[]；`purgeTrashItem` 设置 `purged=true` 不可恢复
- **历史记录**：充值/消费追加到 `history[]`，编辑/删除历史自动重算余额
- **最近浏览**：维护最近 20 条，去重，初始化时从 localStorage 迁移旧数据
- **导入导出**：JSON 格式（overwrite/merge），自动货币转换（CNY↔USD 汇率 7.25）
- **分页**：`usersPerPage=0` 自适应全量；可选 8/12/16/20/24；搜索/筛选/翻页自动重置 currentPage=1
- **移动端**：<768px 用底部弹出菜单 + 浮动按钮；≥768px 用 Sidebar
- **`StatsModal`**：React.lazy 懒加载，外层必须 `<Suspense fallback={null}>`

---

## 注意事项

- 所有 .ts/.tsx 使用 **UTF-8** 编码
- **禁止修改** `src/vite-env.d.ts`
- 修改 `src/types/index.ts` 需同步所有引用
- `db.ts` schema 修改必须递增版本号
- `cn()` 不含 tailwind-merge（仅 filter+join），className 冲突需手动处理
- **禁止批量删除**文件或目录（del /s、rm -rf、Remove-Item -Recurse），删除文件逐文件执行
