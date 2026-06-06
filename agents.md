# AGENTS.md — UserTool（VIP 用户管理系统 v2）

## 项目概述

VIP 用户管理系统 v2 — React SPA，管理 VIP 会员的余额充值、消费扣减、统计、导入导出、云端同步。
**仓库:** https://github.com/YOU5A/UserTool
**作者:** YOU5A
**部署:** GitHub Pages（`.github/workflows/deploy.yml`，push main/master 自动构建部署）

---

## 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| 框架 | React | ^18.3.1 |
| 类型系统 | TypeScript（strict: true, target: ES2020） | ~5.7.2 |
| 构建工具 | Vite + @vitejs/plugin-react | ^6.2.0 |
| 样式 | Tailwind CSS v4 + @tailwindcss/vite | ^4.0.9 |
| UI 组件 | Radix UI（dialog/select）+ class-variance-authority | — |
| 状态管理 | Zustand（仅 UI 状态，业务状态在 VIPManager 内存） | ^5.0.3 |
| 本地存储 | Dexie (IndexedDB) | ^4.0.11 |
| 云后端 | Supabase（Auth + Database + Realtime） | ^2.49.1 |
| 图表 | Chart.js + react-chartjs-2 | ^4.4.7 / ^5.3.0 |
| 图标 | lucide-react | ^0.474.0 |
| 工具 | clsx + tailwind-merge | — |

---

## 🛡️ 绝对保护规则

- **禁止修改** `src/vite-env.d.ts`
- **禁止修改** `ErrorBoundary` 为函数组件（必须保持 class 组件）
- **禁止批量删除**文件或目录（`del /s`、`rd /s`、`rmdir /s`、`Remove-Item -Recurse`、`rm -rf`）
- **禁止删除** `dist/` 和 `node_modules/`
- 所有文本文件统一使用 UTF-8 without BOM 编码
- 不要创建带 BOM 的文件

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
│       └── deploy.yml          # GitHub Pages 自动部署（Node 22）
├── public/                     # 静态资源
├── dist/                       # 构建产物（禁止删除）
├── src/
│   ├── main.tsx                # React 入口（createRoot + StrictMode）
│   ├── App.tsx                 # 根组件：视图路由、Modal 管理、初始化编排、认证集成
│   ├── index.css               # Tailwind + 自定义动画/滚动条
│   ├── vite-env.d.ts           # 【禁止修改】
│   ├── types/index.ts          # 所有类型定义
│   ├── lib/
│   │   ├── vip-manager.ts      # 核心业务引擎（createVIPManager 工厂）
│   │   ├── db.ts               # Dexie schema（当前 v4，修改必须递增版本号）
│   │   ├── supabase.ts         # Supabase 客户端 + 云端 CRUD + Realtime
│   │   ├── auth-storage.ts     # Cookie-based Supabase 认证持久化
│   │   └── utils.ts            # 格式化/货币/导出/卡号等工具函数
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

## 核心架构：云端为主 + 增量推送

### 同步模型（v4，已移除 outbox/脏追踪）

```
用户操作 → VIPManager 方法
           ├── 更新 state.users[id]（增/删/改/充值/消费/历史编辑/置顶/信息更新）
           ├── 立即 saveUserToDb(id) → Dexie 写入单条
           ├── markChanged(id) → changedUserIds Set 记录变更
           ├── addLog()（操作日志）+ saveMetaToDb()
           └── bumpDataVersion()（Zustand，触发 UI 重渲染）
                  ↓
            useSupabaseAuth 监听 dataVersion 变更 → 1s 防抖 schedulePush()
                  ↓
            doPush() → getChangedUserIdsAndClear() → 分类 upsert/delete
                  ↓
            pushUsersBatch() 批量写入 Supabase（每批 500 条）
            + deleteUserData() 逐条删除云端数据
```

**Pull 方向：**
```
登录初始化 / window focus / Realtime 变更 / 手动刷新
  → fetchAllUserData()（分页 1000 条/页）
  → replaceAllFromCloud(cloudRows) → 全量替换内存 + Dexie
```

### VIPManager（`src/lib/vip-manager.ts`）

通过 `createVIPManager()` 工厂创建单例，`useVIPManager` Hook 在模块级维护引用。

**导出的类型:**
- `CloudDataRow` — 云端数据行（owner_id, user_id, data: User, updated_at）
- `VIPManagerState` — 内部状态接口（users, recentViewed, trash, logs, syncState）
- `VIPManagerInstance` — 公开 API 接口
- `createVIPManager()` — 工厂函数

**公开方法（VIPManagerInstance）:**

| 方法 | 说明 |
|------|------|
| `init(userId)` | 初始化：打开 Dexie DB → 迁移旧 localStorage → `loadData()` |
| `loadData()` | 从 Dexie 加载 users + meta 到内存 |
| `replaceAllFromCloud(cloudRows)` | 全量替换内存+DB（云端 Pull 时使用） |
| `getChangedUserIdsAndClear()` | 获取变更用户 ID 集合并清空（Push 时使用） |
| `addNewUser(phone, amount, remark?, cardNo?)` | 新用户：11 位手机号，`id=phone, tail=phone.slice(-4)` |
| `addOldUser(tail, amount, remark?, cardNo?)` | 旧用户：4 位尾号，`id="old-{tail}"`，自动排重 |
| `addAmount(userId, amount, description?)` | 充值（追加到 history[]） |
| `subtractAmount(userId, amount, description?)` | 消费（余额不足返回 false） |
| `togglePin(userId)` | 切换置顶状态 |
| `updateUserInfo(userId, { remark?, cardNo? })` | 更新用户备注/卡号 |
| `deleteUser(userId)` | 软删除：`deleted=true` + `_deletedAt`，移入 trash[] |
| `purgeTrashItem(userId)` | 彻底清除：`purged=true`，不可恢复 |
| `restoreFromTrash(userId)` | 从回收站恢复 |
| `clearTrash()` | 清空回收站 |
| `editHistory(userId, historyId, newData)` | 编辑历史（自动重算余额） |
| `deleteHistory(userId, historyId)` | 删除历史（自动重算余额） |
| `getUser(userId)` | 获取单个用户 |
| `getAllUsers()` | 获取所有用户 |
| `getTrashUsers()` | 获取回收站用户 |
| `searchUsers(query)` | 按手机号/尾号/卡号/备注搜索 |
| `filterUsers(filter)` | 按筛选条件过滤（all/card/pinned） |
| `addRecentView(userId)` | 加入最近浏览列表 |
| `getRecentUsers()` | 获取最近浏览用户列表 |
| `getHistory(userId, historyId)` | 获取指定历史记录 |
| `getSyncState()` | 返回同步状态 |
| `getStatsData(startDate, endDate)` | 获取统计数据 |
| `buildExportPayload()` | 导出完整数据（JSON） |
| `applyImport(payload, mode)` | 导入数据（overwrite / merge），自动货币转换 |
| `deleteAllUsers()` | 删除所有用户：清空内存+DB，标记所有 changedUserIds 供 Push 删除云端 |
| `convertCurrencyData(from, to)` | 转换所有金额的货币单位（CNY ↔ USD） |

### 数据库（`src/lib/db.ts`）

Dexie，按用户 ID 分库 `vip_manager_{userId}`，当前 schema v4：

| 表 | 主键 | 索引字段 | 内容 |
|----|------|----------|------|
| `users` | `id` | phone, tail, pinned, amount, created, remark, cardNo | 用户完整数据（含 history[], deleted, purged） |
| `meta` | `key` | — | recentViewed, trash, logs, sync_state, _justDeletedAll, legacy_migrated_v1 |

**版本历史:**
- v1: users + meta
- v2: 新增 outbox 表
- v3: users 新增 remark, cardNo 索引
- **v4（当前）:** 移除 outbox 表，升级时清空遗留数据

**导出:** `VipDatabase`（类）、`getDb(userId)`（单例管理）、`closeDb()`（切换用户关闭旧实例）
**注意事项:** Schema 修改必须递增版本号（当前 v4）

### Supabase 客户端（`src/lib/supabase.ts`）

**导出函数:**
- `getSupabaseConfig()` — 读取配置（localStorage: `sb_project_url` / `sb_anon_key`）
- `saveSupabaseConfig(url, anonKey)` — 保存配置
- `clearSupabaseConfig()` — 清除配置 + 重置客户端
- `initSupabaseClient()` — 初始化客户端（含 auth: persistSession + autoRefreshToken）
- `getSupabaseClient()` — 获取当前客户端（懒初始化）
- `resetSupabaseClient()` — 重置客户端
- `fetchAllUserData(client, ownerId)` — 分页拉取全部用户数据（1000 条/页，按 user_id 游标分页）
- `pushUsersBatch(client, ownerId, users)` — 批量写入云端（每批 500 条 upsert，onConflict: owner_id+user_id）
- `upsertUserData(client, ownerId, userId, data, localTs)` — 条件写入单条（本地 `__ts > 远程 updated_at` 才写入）
- `deleteUserData(client, ownerId, userId)` — 删除远程单条数据
- `deleteAllUserData(client, ownerId)` — 删除远程全部数据
- `subscribeToChanges(client, ownerId, callback)` — Realtime 订阅（监听 public.user_data 的 INSERT/UPDATE/DELETE）

### 认证存储（`src/lib/auth-storage.ts`）

导出 `cookieStorage` 对象，替代默认 localStorage 解决 Codex 内置浏览器等 WebView 环境下 localStorage 刷新丢失问题。同时写入 cookie（30 天过期，前缀 `sb-auth-`）和 localStorage 双重保障。

### 工具函数（`src/lib/utils.ts`）

| 导出 | 说明 |
|------|------|
| `formatAmount(amount, currency?)` | 格式化金额（¥ 前缀） |
| `parseDate(dateStr)` | 解析日期（ISO/M.D/M,D 三种格式） |
| `formatDate(dateStr)` | 格式化为中文日期 |
| `formatDateTime(dateStr)` | 格式化为中文日期时间 |
| `getOperationText(type, amount)` | 获取操作描述文本 |
| `generateId()` | 生成唯一 ID |
| `pad2(n)` | 补零 |
| `formatDateForFilename(date)` | 文件命名用日期（yyyymmdd-HHMMSS） |
| `downloadJSON(obj, filename)` | 下载 JSON 文件 |
| `normalizeCardNo(input)` | 规范化卡号（提取前 4 位数字，不足补零） |
| `isValidCardNo(cardNo)` | 校验卡号（4 位数字 0001-9999，0000 无效） |
| `cn(...inputs)` | 类名合并（仅 filter+join，不含 tailwind-merge） |
| `getBaseCurrency()` | 获取基础货币（默认 CNY） |
| `setBaseCurrency(c)` | 设置基础货币 |
| `getConversionRate(from, to)` | 获取汇率（CNY↔USD: 7.25） |

### 类型定义（`src/types/index.ts`）

| 接口 | 字段 |
|------|------|
| `HistoryRecord` | id, type ("add"|"subtract"), amount, description, date |
| `User` | id, phone, tail, amount, created, pinned, deleted, purged, remark?, cardNo?, history[], __ts?, _deletedAt? |
| `SyncState` | lastUpdatedAt: string \| null |
| `VipMetaRow` | owner_id, key, value |
| `CloudSyncSettings` | autoPullEnabled, autoPullIntervalSec, pullOnFocus, realtimeEnabled |
| `ExportPayload` | schemaVersion, app, exportedAt, data (users/recentViewed/trash/logs), settings (usersPerPage/theme/currency) |
| `LogEntry` | type, message, timestamp, userId? |
| `StatsData` | totalUsers, totalAmount, activeUsers, consumptionTrend[], todayRecharge, todayConsumption, weekRecharge |
| `ImportResult` | usersImported, errors[] |

修改此文件需同步所有引用文件。

### 状态管理（二层分离）

| 层 | 位置 | 管理内容 |
|----|------|----------|
| UI 状态 | Zustand `useAppStore` | searchQuery, activeFilter, currentPage, usersPerPage (0=自适应/8/12/16/20/24), theme, currency, activeView, 11 个 modal 开关, dataVersion |
| 业务状态 | `VIPManager.state` | users, recentViewed, trash, logs, syncState |

**Zustand 状态字段:** `searchQuery`, `activeFilter`, `currentPage`, `usersPerPage`, `currentUserId`, `currentHistoryId`, `theme`, `currency`, `activeView`, `modals`（11 个）, `dataVersion`
**Zustand 操作:** `bumpDataVersion`, `setSearchQuery`, `setActiveFilter`, `setCurrentPage`, `setUsersPerPage`, `setCurrentUserId`, `setCurrentHistoryId`, `setTheme`, `setCurrency`, `setActiveView`, `openModal`, `closeModal`

**activeView 可选值:** `"users"` | `"pinned"` | `"card"` | `"stats"` | `"trash"` | `"logs"` | `"settings"`

**11 个 Modal:** `userDetail`, `addAmount`, `subtractAmount`, `addUser`, `deleteUser`, `settings`, `stats`, `trash`, `logs`, `editHistory`, `deleteHistory`

### 初始化流程

```
App mount → useSupabaseAuth（自动检测配置和会话）
  ├── 已配 Supabase + 已登录 → onAuthStateChange(INITIAL_SESSION/SIGNED_IN)
  │     → mgr.init(userId) → doPull → setupRealtime
  ├── 已配 Supabase + 未登录 → App useEffect → mgr.init("local_offline")
  └── 未配 Supabase → App useEffect → mgr.init("local_offline")
```

### 登出

signOut → doPush（推送剩余变更）→ client.auth.signOut() → mgr.init("local_offline") → bumpDataVersion → 重渲染

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

| 组件 | 关键 Props |
|------|-------|
| `MainLayout` | searchQuery, onSearchChange, onAddUser, onRefresh, onSettings, onUserClick, onClearRecent, isLoggedIn?, userEmail?, onLogout?, isConfigured?, onConfigure?, onClearConfig?, onSignIn?, onSignUp?, children |
| `Navbar` | searchQuery, onSearchChange, onAddUser, onRefresh?, isLoggedIn?, userEmail?, onLogout?, isConfigured?, onConfigure?, onClearConfig?, onSignIn?, onSignUp? |
| `Sidebar` | onRefresh, onSettings, onUserClick, onClearRecent |

**MainLayout 包含:** 桌面端 Sidebar（md:block）+ 移动端底部弹出菜单（<768px，含导航链接 + 设置 + 主题切换）+ 浮动导航按钮

### 用户组件（`src/components/users/`）

| 组件 | 说明 |
|------|------|
| `UserGrid` | 自适应网格视图（ResizeObserver 动态计算列/行），含搜索/筛选/分页/卡片视图 |
| `UserCard` | React.memo 包裹的用户卡片（含置顶切换） |
| `UserDetail` | 用户详情面板（含历史记录、备注、卡号显示） |
| `UserForm` | 添加用户表单（支持新用户手机号 / 旧用户尾号 / 卡号输入） |

### Modal 组件（`src/components/modals/`）

| 组件 | 说明 |
|------|------|
| `AmountModal({ type })` | 充值/消费弹窗 |
| `EditHistoryModal` | 编辑历史记录 |
| `DeleteHistoryModal` | 删除历史记录 |
| `DeleteUserModal` | 删除用户确认 |
| `LogsModal` | 操作日志 |
| `SettingsModal` | 设置面板（含导出/导入/货币切换/删除全部用户/主题/Supabase 配置），`React.lazy` 懒加载 |
| `StatsModal` | 统计图表，`React.lazy` 懒加载 |
| `TrashModal` | 回收站 |

### 历史组件（`src/components/history/`）

| 组件 | 说明 |
|------|------|
| `HistoryItem({ record, userId })` | 单条历史记录展示 |

---

## 关键业务规则

- **新用户:** 11 位手机号，`id=phone, tail=phone.slice(-4)`，可选备注(remark)和卡号(cardNo)
- **旧用户:** 4 位尾号，`id="old-{tail}"`，添加时自动检查重复（含已删除），可选备注和卡号
- **卡号:** 4 位数字（0001-9999），输入时自动提取前 4 位数字并补零，`normalizeCardNo` + `isValidCardNo` 校验；创建用户时检查卡号唯一性
- **置顶:** `togglePin(userId)` 切换 pinned 状态，置顶用户排在前面
- **备注/卡号更新:** `updateUserInfo(userId, { remark?, cardNo? })` 单独更新，更新卡号时也做唯一性校验
- **软删除:** `deleteUser` → `deleted=true` + `_deletedAt`，移入 trash[]；`purgeTrashItem` 设置 `purged=true`（purged 用户从 DB 中删除）不可恢复
- **全量删除:** `deleteAllUsers()` → 清空内存 + Dexie（users.clear() + meta 重置） + 标记所有 changedUserIds 供 Push 识别为全删
- **历史记录:** 充值/消费追加到 `history[]`（type: "add"/"subtract"），编辑/删除历史自动重算用户 `amount`
- **最近浏览:** 维护最近 20 条，去重，新访问前置；`addRecentView(userId)` 管理
- **搜索:** `searchUsers(query)` 按手机号/尾号/卡号/备注匹配
- **筛选:** `filterUsers(filter)` 支持 "all"/"card"/"pinned"
- **导入导出:** JSON 格式（schemaVersion, data.users, data.recentViewed, data.trash, data.logs, settings），支持 overwrite 和 merge 两种模式，自动货币转换（CNY ↔ USD 汇率 7.25）
- **货币转换:** `convertCurrencyData(from, to)` 转换所有用户和历史金额，汇率 7.25
- **分页:** `usersPerPage=0` 自适应网格；可选 0/8/12/16/20/24；搜索/筛选/翻页自动重置 `currentPage=1`
- **自适应网格:** UserGrid 通过 ResizeObserver 动态计算列数（最小卡片宽 260px）和行数，滚动翻页
- **移动端:** <768px 用底部弹出菜单 + 浮动按钮；>=768px 用 Sidebar；Navbar 始终显示
- **StatsModal + SettingsModal:** `React.lazy` 懒加载，外层必须 `<Suspense fallback={null}>`
- **主题:** `theme` 存入 localStorage，切换时操作 `document.documentElement.classList`
- **认证:** `useSupabaseAuth` 暴露 signIn/signUp/signOut/configureAndSave/clearConfig/pullFromCloud，认证状态自动初始化
- **Sync 推送:** `dataVersion` 变化 → 1s 防抖 → `doPush` → 若 changedUserIds > 10 且 users 为空（全删场景）直接全删云端；否则分类 upsert/delete
- **Sync 拉取:** 分页（1000 条/页，游标 `user_id`）+ 全量替换本地数据
- **旧 localStorage 迁移:** 首次打开 v4 DB 时，自动将旧 localStorage 数据（vipManagerUsers 等）迁移到 Dexie 并清理

---

## 非项目文件

| 路径 | 来源 | 说明 |
|------|------|------|
| `node_modules/` | .gitignore | npm 依赖 |
| `dist/` | .gitignore | 构建产物 |
| `*.tsbuildinfo` | .gitignore | TS 增量编译缓存 |
| `.env` / `.env.local` / `.env.*.local` | .gitignore | 环境变量 |
| `会员充值.xlsx` | .gitignore | 用户数据文件（非源码，已从版本控制移除） |
| `convert_xlsx.py` | 根目录 | Excel 转换脚本（非源码） |
| `import_data.json` | 根目录 | 导入数据文件（非源码） |
| `vite_err.txt` / `vite_out.txt` | 根目录 | Vite 临时日志（未 gitignore，不应纳入版本控制） |

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

## Vite 构建配置

- `base: '/UserTool/'`（GitHub Pages 子路径）
- 别名 `@/` → `src/`（tsconfig paths + vite alias 双重配置）
- 手动分包：vendor-chartjs / vendor-supabase / vendor-dexie / vendor-radix / vendor-lucide
- chunkSizeWarningLimit: 500 KB
