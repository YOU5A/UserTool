# AGENTS.md — UserTool（VIP 用户管理系统 v2）

## 项目概述

VIP 用户管理系统 v2 — React SPA，管理 VIP 会员的余额充值、消费扣减、统计、导入导出、云端同步。
**仓库:** https://github.com/YOU5A/UserTool
**部署:** GitHub Pages（`.github/workflows/deploy.yml`，push main/master 自动构建部署）

---

## 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| 框架 | React | ^18.3.1 |
| 类型系统 | TypeScript（strict: true, target: ES2020） | ~5.7.2 |
| 构建工具 | Vite + @vitejs/plugin-react | ^6.2.0 |
| 样式 | Tailwind CSS v4 + @tailwindcss/vite | ^4.0.9 |
| UI 组件 | Radix UI（dialog/select/switch/checkbox/tabs/label/separator/slot） | — |
| 状态管理 | Zustand（仅 UI 状态，业务状态在 VIPManager 内存） | ^5.0.3 |
| 本地存储 | Dexie (IndexedDB) | ^4.0.11 |
| 云后端 | Supabase（Auth + Database + Realtime） | ^2.49.1 |
| 图表 | Chart.js + react-chartjs-2 | ^4.4.7 |
| 图标 | lucide-react | ^0.474.0 |
| 工具 | clsx + tailwind-merge + class-variance-authority | — |

---

## 编码规范

- **编码:** UTF-8 without BOM，交互语言中文
- **路径别名:** `@/` → `src/`（tsconfig paths + vite alias 双重配置）
- **TypeScript:** strict: true，所有类型定义集中在 `src/types/index.ts`
- **命名:** 组件文件 PascalCase / Hook 及工具文件 camelCase / 类型 `export interface`
- **组件:** 全部函数组件 + Hooks，仅 `ErrorBoundary` 是类组件（**禁止改为函数组件**）
- **禁止修改** `src/vite-env.d.ts`
- **禁止批量删除**文件或目录
- **禁止删除** `dist/` 和 `node_modules/`

---

## 项目结构

```
UserTool/
├── index.html                  # HTML 入口（lang="zh-CN"）
├── package.json                # 依赖与脚本（version: 2.0.0）
├── vite.config.ts              # Vite 配置（base: /UserTool/, alias: @/ → src/）
├── tsconfig.json               # TypeScript 根配置
├── tsconfig.app.json           # 应用 TS 配置
├── tsconfig.node.json          # Node 端 TS 配置
├── .gitignore
├── agents.md                   # 本文件
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Pages 自动部署
├── public/                     # 静态资源
├── dist/                       # 构建产物（禁止删除）
├── src/
│   ├── main.tsx                # React 入口（createRoot）
│   ├── App.tsx                 # 根组件：视图路由、Modal 管理、应用初始化
│   ├── index.css               # Tailwind + 自定义动画/滚动条
│   ├── vite-env.d.ts           # 【禁止修改】
│   ├── types/index.ts          # 所有类型定义
│   ├── lib/
│   │   ├── vip-manager.ts      # 核心业务引擎（createVIPManager 工厂）
│   │   ├── db.ts               # Dexie schema（当前 v2，修改必须递增版本号）
│   │   ├── supabase.ts         # Supabase 客户端
│   │   ├── auth-storage.ts     # Cookie-based Supabase 认证持久化
│   │   └── utils.ts            # 格式化/货币/导出等工具函数
│   ├── store/useAppStore.ts    # Zustand UI 状态
│   ├── hooks/
│   │   ├── useVIPManager.ts    # VIPManager 模块级单例 Hook
│   │   ├── useSupabaseAuth.ts  # 认证 + 自动同步 + Realtime 监听
│   │   ├── useViewportInfo.ts  # isMobile / isFullscreen 响应式检测
│   │   └── useDebounce.ts      # 通用防抖 Hook
│   └── components/
│       ├── ui/                 # Button / Dialog / Input / Select / ErrorBoundary
│       ├── layout/             # MainLayout / Sidebar / Navbar
│       ├── users/              # UserGrid / UserCard / UserDetail / UserForm
│       ├── modals/             # AmountModal / EditDeleteModals / LogsModal / SettingsModal / StatsModal / TrashModal
│       └── history/            # HistoryItem
└── node_modules/               # 依赖（禁止删除）
```

---

## 核心架构：离线优先 + 云端同步

### 数据流

```
用户操作 → VIPManager 方法（内存 state）
           ├── 更新 state.users[id]（增/删/改/充值/消费/历史编辑）
           ├── 加入 dirtyUpserts / outboxMap（标记待持久化 & 待同步）
           ├── addLog()（操作日志）
           └── scheduleSave() → flushNow() → Dexie 批量写入（users + meta + outbox）
                  ↓
            dataVersion 变更 → 3s 防抖 → syncPushToCloud()
                  ↓
            Supabase user_data 表（条件推送：本地 __ts > 远程 updated_at 才写入）
```

### VIPManager（`src/lib/vip-manager.ts`）

通过 `createVIPManager()` 工厂创建单例，`useVIPManager` Hook 在模块级维护引用。

**导出的类型:**
- `VIPManagerState` — 内部状态接口（users, recentViewed, trash, logs, syncState, outboxMap, dirtyUpserts）
- `VIPManagerInstance` — 公开 API 接口
- `createVIPManager()` — 工厂函数

**公开方法（VIPManagerInstance）:**

| 方法 | 说明 |
|------|------|
| `init(userId)` | 初始化：`loadData()` → 从 IndexedDB 加载到内存 |
| `loadData()` | 从 Dexie 加载 users + meta + outbox |
| `flushNow()` | 立即持久化 dirtyUpserts 到 Dexie |
| `addNewUser(phone, amount)` | 新用户：11 位手机号，`id=phone, tail=phone.slice(-4)` |
| `addOldUser(tail, amount)` | 旧用户：4 位尾号，`id="old-{tail}"`，自动排重 |
| `addAmount(userId, amount, description)` | 充值（追加到 history[]） |
| `subtractAmount(userId, amount, description)` | 消费（余额不足返回 false） |
| `deleteUser(userId)` | 软删除：`deleted=true` + `_deletedAt`，移入 trash[] |
| `purgeTrashItem(userId)` | 彻底清除：`purged=true`，不可恢复 |
| `restoreFromTrash(userId)` | 从回收站恢复 |
| `clearTrash()` | 清空回收站 |
| `editHistory(userId, historyId, newData)` | 编辑历史（自动重算余额） |
| `deleteHistory(userId, historyId)` | 删除历史（自动重算余额） |
| `getUser(userId)` | 获取单个用户 |
| `getAllUsers()` | 获取所有用户 |
| `getTrashUsers()` | 获取回收站用户 |
| `getRecentUsers()` | 获取最近浏览用户列表 |
| `getHistory(userId, historyId)` | 获取指定历史记录 |
| `getOutboxOps()` | 获取待同步操作 |
| `clearOutboxKeys(keys)` | 清除已同步的出队操作 |
| `getOutboxCount()` | 获取待同步操作数量 |
| `getSyncState()` | 返回同步状态 |
| `getStatsData(startDate, endDate)` | 获取统计数据 |
| `exportPayload()` | 导出完整数据（JSON） |
| `importData(payload, mode)` | 导入数据（overwrite / merge），自动货币转换 |
| `syncPushToCloud(client, ownerId)` | 逐条 outbox 推送到 Supabase |
| `syncPullFromCloud(client, ownerId)` | 分页拉取（1000 条/页），比较 __ts 取最新 |
| `deleteAllUsers()` | 删除所有用户数据 |

### 数据库（`src/lib/db.ts`）

Dexie，按用户 ID 分库 `vip_manager_{userId}`，当前 schema v2：

| 表 | 主键 | 索引字段 | 内容 |
|----|------|----------|------|
| `users` | `id` | phone, tail, pinned, amount, created | 用户完整数据（含 history[], deleted, purged） |
| `meta` | `key` | — | recentViewed, trash, logs, sync_state |
| `outbox` | `key` | type, user_id, ts | 待同步操作队列（upsert / delete） |

**导出:** `VipDatabase`（类）、`getDb(userId)`（单例管理）、`closeDb()`（切换用户关闭旧实例）
**注意事项:** Schema 修改必须递增版本号（当前 v2）

### Supabase 客户端（`src/lib/supabase.ts`）

**导出函数:**
- `getSupabaseConfig()` — 读取配置
- `saveSupabaseConfig(url, anonKey)` — 保存配置
- `clearSupabaseConfig()` — 清除配置
- `initSupabaseClient()` — 初始化客户端
- `getSupabaseClient()` — 获取当前客户端
- `resetSupabaseClient()` — 重置客户端
- `fetchAllUserData(client, ownerId)` — 分页拉取全部用户数据
- `upsertUserData(client, ownerId, data)` — 条件写入单条数据
- `deleteUserData(client, ownerId, userId)` — 删除远程数据
- `subscribeToChanges(client, ownerId, callback)` — Realtime 订阅

### 认证存储（`src/lib/auth-storage.ts`）

导出 `cookieStorage` 对象，替代默认 localStorage 解决 Codex 内置浏览器等 WebView 环境下 localStorage 刷新丢失问题。同时写入 cookie（30 天过期）和 localStorage 双重保障。

### 工具函数（`src/lib/utils.ts`）

| 导出 | 说明 |
|------|------|
| `formatAmount(amount, currency?)` | 格式化金额 |
| `formatDate(dateStr)` | 格式化日期 |
| `formatDateTime(dateStr)` | 格式化日期时间 |
| `getOperationText(type, amount)` | 获取操作描述文本 |
| `generateId()` | 生成唯一 ID |
| `pad2(n)` | 补零 |
| `formatDateForFilename(date)` | 文件命名用日期 |
| `downloadJSON(obj, filename)` | 下载 JSON 文件 |
| `cn(...inputs)` | 类名合并（仅 filter+join，不含 tailwind-merge） |
| `getBaseCurrency()` | 获取基础货币 |
| `setBaseCurrency(c)` | 设置基础货币 |
| `getConversionRate(from, to)` | 获取汇率（CNY↔USD: 7.25） |

### 类型定义（`src/types/index.ts`）

**导出接口:** `HistoryRecord`、`User`、`SyncState`、`OutboxOp`、`VipMetaRow`、`CloudSyncSettings`、`ExportPayload`、`LogEntry`、`StatsData`、`ImportResult`
修改此文件需同步所有引用文件。

### 同步机制

- **Push:** `dataVersion` 变更 → 3s 防抖 → 逐条 outbox 推送到 Supabase `user_data` 表
- **Pull:** 登录初始化 / window focus / Realtime 收到变更 → 分页拉取（1000 条/页），比较 `__ts` 取最新
- **Realtime:** Supabase channel `user_data_changes` 监听 INSERT/UPDATE/DELETE
- **条件写入:** 仅当本地 `__ts > 远程 updated_at` 时才覆盖云端数据

### 状态管理（二层分离）

| 层 | 位置 | 管理内容 |
|----|------|----------|
| UI 状态 | Zustand `useAppStore` | searchQuery, activeFilter, currentPage, usersPerPage (0=自适应/8/12/16/20/24), theme, currency, activeView, 11 个 modal 开关, dataVersion |
| 业务状态 | `VIPManager.state` | users, recentViewed, trash, logs, syncState |

**Zustand 状态字段:** `searchQuery`, `activeFilter`, `currentPage`, `usersPerPage`, `currentUserId`, `currentHistoryId`, `theme`, `currency`, `activeView`, `modals`（11个）, `dataVersion`
**Zustand 操作:** `bumpDataVersion`, `setSearchQuery`, `setActiveFilter`, `setCurrentPage`, `setUsersPerPage`, `setCurrentUserId`, `setCurrentHistoryId`, `setTheme`, `setCurrency`, `setActiveView`, `openModal`, `closeModal`

**11 个 Modal:** `userDetail`, `addAmount`, `subtractAmount`, `addUser`, `deleteUser`, `settings`, `stats`, `trash`, `logs`, `editHistory`, `deleteHistory`

### 初始化流程

```
App mount → useSupabaseAuth
  ├── 已配 Supabase + 已登录 → mgr.init(userId) → doPull → setupRealtime
  ├── 已配 Supabase + 未登录 → mgr.init("local_offline")（纯离线）
  └── 未配 Supabase → mgr.init("local_offline")（纯离线）
```

### 登出

登出后 → 清空内存数据 → `mgr.init("local_offline")` → 重渲染

---

## 组件清单

### UI 组件（`src/components/ui/`）

| 组件 | 类型 | 说明 |
|------|------|------|
| `Button` | `React.forwardRef` | 通用按钮，含 variant/size |
| `Dialog` + `DialogContent` | 函数组件 | 弹窗容器 |
| `Input` + `Textarea` | `React.forwardRef` | 输入框组件 |
| `Select` | 函数组件 | 下拉选择 |
| `ErrorBoundary` | **类组件（禁止改函数）** | 错误边界 |

### 布局组件（`src/components/layout/`）

| 组件 | Props |
|------|-------|
| `MainLayout` | children, onRefresh, onSettings, onUserClick, onClearRecent |
| `Sidebar` | onRefresh, onSettings, onUserClick, onClearRecent |
| `Navbar` | — |

### 用户组件（`src/components/users/`）

| 组件 | 说明 |
|------|------|
| `UserGrid` | 用户网格视图（含搜索/筛选/分页） |
| `UserCard` | React.memo 包裹的用户卡片 |
| `UserDetail` | 用户详情面板 |
| `UserForm` | 添加用户表单 |

### Modal 组件（`src/components/modals/`）

| 组件 | 说明 |
|------|------|
| `AmountModal({ type })` | 充值/消费弹窗 |
| `EditHistoryModal` | 编辑历史记录 |
| `DeleteHistoryModal` | 删除历史记录 |
| `DeleteUserModal` | 删除用户确认 |
| `LogsModal` | 操作日志 |
| `SettingsModal` | 设置面板 |
| `StatsModal` | 统计图表（`React.lazy` 懒加载） |
| `TrashModal` | 回收站 |

### 历史组件（`src/components/history/`）

| 组件 | 说明 |
|------|------|
| `HistoryItem({ record, userId })` | 单条历史记录展示 |

---

## 关键业务规则

- **新用户:** 11 位手机号，`id=phone, tail=phone.slice(-4)`
- **旧用户:** 4 位尾号，`id="old-{tail}"`，添加时自动检查重复
- **软删除:** `deleteUser` → `deleted=true` + `_deletedAt`，移入 trash[]；`purgeTrashItem` 设置 `purged=true` 不可恢复
- **历史记录:** 充值/消费追加到 `history[]`（type: "add"/"subtract"），编辑/删除历史自动重算用户 `amount`
- **最近浏览:** 维护最近 20 条，去重，新访问前置；初始化时从 localStorage 迁移旧数据
- **导入导出:** JSON 格式（schemaVersion, data.users, data.recentViewed, data.trash, data.logs, settings），支持 overwrite 和 merge 两种模式，自动货币转换（CNY ↔ USD 汇率 7.25）
- **分页:** `usersPerPage=0` 自适应全量；可选 0/8/12/16/20/24；搜索/筛选/翻页自动重置 `currentPage=1`
- **移动端:** <768px 用底部弹出菜单 + 浮动按钮；>=768px 用 Sidebar
- **StatsModal:** `React.lazy` 懒加载，外层必须 `<Suspense fallback={null}>`
- **主题:** `theme` 存入 localStorage，切换时操作 `document.documentElement.classList`

---

## 非项目文件

| 路径 | 来源 | 说明 |
|------|------|------|
| `node_modules/` | .gitignore | npm 依赖 |
| `dist/` | .gitignore | 构建产物 |
| `*.tsbuildinfo` | .gitignore | TS 增量编译缓存 |
| `.env` / `.env.local` / `.env.*.local` | .gitignore | 环境变量 |
| `会员充值.xlsx` | 根目录 | 用户数据文件（非源码） |

---

## 运行方式

```bash
cd UserTool
npm run dev      # 开发模式 (http://localhost:5173/UserTool/)
npm run build    # 生产构建（先 tsc -b 类型检查，再 vite build → dist/）
npm run preview  # 预览构建产物
```

## GitHub Actions

`.github/workflows/deploy.yml` — push 到 main/master 时自动：`npm ci` → `npm run build` → 部署到 GitHub Pages（Node 22）。
