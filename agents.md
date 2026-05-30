﻿# AGENTS.md — VIP用户管理系统

## 项目概述

**VIP用户管理系统** 是一个基于 React 的单页 Web 应用，用于管理VIP会员用户，支持余额充值、消费扣减、数据统计、导入导出、云端同步等功能。当前版本 `2.0.0`。

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | React 18.3 |
| 类型系统 | TypeScript 5.7（strict: true，target: ES2020） |
| 构建工具 | Vite 6.2 + @vitejs/plugin-react |
| 样式方案 | Tailwind CSS 4 + @tailwindcss/vite 插件 |
| UI 组件 | @radix-ui/react-dialog, @radix-ui/react-select, @radix-ui/react-switch, @radix-ui/react-checkbox, @radix-ui/react-tabs, @radix-ui/react-label, @radix-ui/react-separator, @radix-ui/react-slot |
| 状态管理 | zustand 5 |
| 本地数据库 | Dexie 4（IndexedDB 封装） |
| 云后端 | @supabase/supabase-js 2.49（Auth + Database + Realtime） |
| 图表 | chart.js 4.4 + react-chartjs-2 5.3 |
| 图标 | lucide-react 0.474 |
| 工具函数 | clsx 2.1 + tailwind-merge 3.0 + class-variance-authority 0.7 |

## 编码规范

- **语言**：通用交互语言为中文，代码注释可使用中文
- **编码**：所有文件统一使用 UTF-8
- **路径别名**：使用 `@/` 指向 `src/` 目录（`tsconfig.app.json` 的 `paths` + `vite.config.ts` 的 `resolve.alias` 双重配置）
- **TypeScript**：`strict: true`，所有接口和类型定义在 `src/types/index.ts`
- **组件风格**：函数组件 + Hooks，唯一的类组件是 `ErrorBoundary`
- **命名约定**：
  - 组件文件：PascalCase（如 `UserCard.tsx`）
  - 工具/Hook文件：camelCase（如 `useVIPManager.ts`）
  - 类型/接口：PascalCase，使用 `export interface` 导出
  - 函数/变量：camelCase

## 项目结构

```
vip-manager/
├── index.html                         # 入口 HTML（lang="zh-CN"）
├── package.json                       # 依赖与脚本（version 2.0.0）
├── vite.config.ts                     # Vite 配置：@别名 + react插件 + Tailwind插件
├── tsconfig.json                      # TypeScript 根配置（引用子配置）
├── tsconfig.app.json                  # 应用 TS 配置（strict, ES2020, @路径映射）
├── tsconfig.node.json                 # Node/Vite TS 配置
├── public/                            # 静态资源
└── src/
    ├── main.tsx                       # React 入口（React.StrictMode）
    ├── App.tsx                        # 根组件：视图路由、Modal管理、初始化流程
    ├── index.css                      # 全局样式（详见下方 CSS 约定）
    ├── vite-env.d.ts                  # Vite 类型声明（禁止修改）
    ├── types/
    │   └── index.ts                   # 所有类型定义（User, HistoryRecord, SyncState, OutboxOp, VipMetaRow, CloudSyncSettings, ExportPayload, LogEntry, StatsData, ImportResult）
    ├── lib/
    │   ├── vip-manager.ts             # 核心业务引擎（详见 核心架构 小节）
    │   ├── db.ts                      # Dexie 本地数据库（详见 DB Schema 小节）
    │   ├── supabase.ts                # Supabase 客户端：配置存取、CRUD、Realtime 订阅
    │   └── utils.ts                   # 工具函数（详见 工具函数 小节）
    ├── store/
    │   └── useAppStore.ts             # Zustand 全局 UI 状态（详见 状态管理 小节）
    ├── hooks/
    │   ├── useVIPManager.ts           # VIPManager 单例 Hook
    │   ├── useSupabaseAuth.ts         # Supabase 认证 Hook（登录/注册/登出/配置 + 自动同步 + Realtime）
    │   ├── useViewportInfo.ts         # 视口检测 Hook（isMobile / isFullscreen）
    │   └── useDebounce.ts             # 通用防抖 Hook
    └── components/
        ├── ui/                        # 通用 UI 组件
        │   ├── Button.tsx             # variant: default/destructive/outline/secondary/ghost; size: sm/default/lg/icon
        │   ├── Dialog.tsx             # 基于 Radix Dialog（Dialog + DialogContent）
        │   ├── Input.tsx              # Input + Textarea（两个 forwardRef 组件同文件）
        │   ├── Select.tsx             # 基于 Radix Select
        │   └── ErrorBoundary.tsx      # 类组件错误边界（包裹整个 App，禁止改为函数组件）
        ├── layout/                    # 布局组件
        │   ├── MainLayout.tsx         # 主布局：Navbar + Sidebar + 移动端底部弹出菜单 + 浮动按钮 + 页脚
        │   ├── Sidebar.tsx            # 桌面端侧边栏：最近浏览、导航链接、刷新/设置按钮
        │   └── Navbar.tsx             # 顶部导航：品牌LOGO、搜索框、添加用户按钮、内联 Supabase 配置 + 登录/注册表单
        ├── users/                     # 用户相关组件
        │   ├── UserGrid.tsx           # 用户卡片网格 + 筛选栏 + 分页（支持自适应全量模式 usersPerPage=0）
        │   ├── UserCard.tsx           # 单个用户卡片（React.memo）：余额、最近操作、三点菜单、充值/消费/置顶按钮
        │   ├── UserDetail.tsx         # 用户详情弹窗：统计面板 + 快捷操作 + 完整历史记录
        │   └── UserForm.tsx           # 新增用户表单弹窗：新用户（11位手机号）/ 旧用户（4位尾号）双标签页
        ├── modals/                    # 各类模态框
        │   ├── AmountModal.tsx        # 充值/消费操作弹窗（type="add"|"subtract" 双用）
        │   ├── EditDeleteModals.tsx   # 编辑历史 + 删除历史 + 删除用户（三合一文件）
        │   ├── StatsModal.tsx         # 统计面板（React.lazy 懒加载，Chart.js 双轴折线图 + 指标卡片）
        │   ├── SettingsModal.tsx      # 设置：主题/每页显示数/货币/数据导出导入（覆盖/合并模式）
        │   ├── TrashModal.tsx         # 回收站：软删除用户列表，恢复/彻底清除/清空
        │   └── LogsModal.tsx          # 操作日志：按类型筛选、逐条删除、清空全部
        └── history/
            └── HistoryItem.tsx        # 历史记录列表项，编辑/删除按钮
```

---

## 类型定义总览

所有类型定义在 `src/types/index.ts`，核心类型如下：

| 类型 | 关键字段 |
|------|----------|
| `User` | `id, phone, tail, amount, created, pinned, deleted, purged, history[], __ts?, _deletedAt?` |
| `HistoryRecord` | `id, type("add"\|"subtract"), amount, description, date` |
| `OutboxOp` | `key, type("upsert"\|"delete"), user_id, ts, payload?` |
| `ExportPayload` | `schemaVersion, app, exportedAt, data{users,recentViewed,trash,logs}, settings{usersPerPage,currency,theme}` |
| `LogEntry` | `type, message, timestamp, userId?` |
| `SyncState` | `lastOpTs, lastUpdatedAt` |
| `StatsData` | `totalUsers, totalAmount, activeUsers, consumptionTrend[], todayRecharge, todayConsumption, weekRecharge` |
| `ImportResult` | `usersImported, errors[]` |
| `CloudSyncSettings` | `autoPullEnabled, autoPullIntervalSec, pullOnFocus, realtimeEnabled` |
| `VipMetaRow` | `owner_id, key, value` |

---

## 核心架构

### 离线优先 + 云端同步

采用 **离线优先（Offline-First）** 架构：

1. **本地存储**：Dexie (IndexedDB)，按用户 ID 创建独立数据库 `vip_manager_{userId}`（表结构见 DB Schema）
2. **VIPManager 工厂**：`createVIPManager()` 是核心业务引擎，维护内存 state + dirtyUpserts/dirtyDeletes 集合 + outboxMap 进行批量异步 flush
3. **Outbox 模式**：操作先写入内存 → 加入 dirtyUpserts → 写入 outbox → `scheduleSave()` 批量 flush IndexedDB → `syncPushToCloud()` 推送到 Supabase
4. **云端存储**：Supabase `user_data` 表（owner_id + user_id 复合主键），数据以 JSON 存入 `data` 列，`updated_at` 记录版本
5. **条件推送**：`upsertUserData` 先查远程 `updated_at`，仅当本地 `__ts > updated_at` 才写入
6. **同步拉取**：`fetchAllUserData` 分页获取（limit 1000/cursor 分页）远程数据，与本地 `__ts` 比较取时间戳更新的合并
7. **Push 触发**：dataVersion 变化后 3 秒防抖触发
8. **Pull 触发**：登录初始化时、窗口 focus 时、Realtime 收到变更时
9. **Realtime**：通过 Supabase Realtime channel `user_data_changes` 监听 `public.user_data` 的 INSERT/UPDATE/DELETE

### DB Schema

文件：`src/lib/db.ts`

```
vip_manager_{userId} (Dexie, schema v2)
├── users 表：id(主键), phone, tail, pinned, amount, created
├── meta 表：key(主键) → 存 recentViewed/trash/logs/sync_state
├── outbox 表：key(主键), type, user_id, ts
```

- `dbInstance` 单例管理（`getDb(userId)` 获取/切换，`closeDb()` 关闭）
- 切换到不同 userId 时自动关闭旧库、打开新库
- **修改 schema 时必须递增版本号**

### 初始化流程

```
App mount → useSupabaseAuth 检查配置
  ├── 已配置 Supabase + 已登录 → mgr.init(userId) → doPull → setupRealtime → rerender
  ├── 已配置 Supabase + 未登录 → mgr.init("local_offline")
  └── 未配置 Supabase → mgr.init("local_offline") 纯离线
```

### 数据流

```
用户操作 → VIPManager 方法
              ├── 更新内存 state.users[id]
              ├── 加入 dirtyUpserts
              ├── 写入 outboxMap
              ├── addLog()
              └── scheduleSave() → flushNow()
                    ├── Dexie transaction 批量写入 users/meta/outbox
                    └── 清理 dirty 集合
                         ↓
               dataVersion 变更 → zustand subscribe
                    └── 3s 防抖 → syncPushToCloud()
                          └── 逐条 outbox → upsertUserData/deleteUserData
```

### VIPManager 接口

文件：`src/lib/vip-manager.ts`，通过 `createVIPManager()` 工厂创建，`useVIPManager` Hook 以模块级单例维护。

**核心方法**（完整列表见接口定义）：
- `init(userId)` / `loadData()` / `flushNow()` — 生命周期
- `addNewUser(phone, initialAmount)` — 新用户，phone 为 11 位数字，`id = phone`，`tail = phone.slice(-4)`
- `addOldUser(tail, initialAmount)` — 旧用户，tail 为 4 位数字，`id = "old-{tail}"`
- `addAmount(userId, amount, description?)` — 充值
- `subtractAmount(userId, amount, description?)` — 消费（余额不足返回 false）
- `togglePin(userId)` — 切换置顶
- `deleteUser(userId)` / `restoreFromTrash(userId)` / `purgeTrashItem(userId)` / `clearTrash()`
- `editHistory(userId, historyId, newData)` / `deleteHistory(userId, historyId)` — 编辑/删除历史记录会同步调整余额
- `getUser(id)` / `getAllUsers()` / `searchUsers(q)` / `filterUsers(f)`
- `addRecentView(userId)` — 添加到最近浏览（维护最近 20 个，去重）
- `getRecentUsers()` — 返回最近浏览的用户列表
- `exportPayload(mode)` / `importData(payload, mode)` — 导入导出（overwrite/merge）
- `convertCurrencyData(from, to)` — 全局货币转换
- `syncPushToCloud(client, ownerId)` / `syncPullFromCloud(client, ownerId)` / `getOutboxCount()`
- `clearRecentViews()` — 清空最近浏览

### 状态管理

两层分离：

**1. UI 状态**（zustand `useAppStore`，文件：`src/store/useAppStore.ts`）

| 字段 | 类型 | 说明 |
|------|------|------|
| `searchQuery` | `string` | 搜索关键词 |
| `activeFilter` | `string` | 筛选：`"all"` / `"pinned"` |
| `currentPage` | `number` | 分页页码 |
| `usersPerPage` | `number` | 每页数量（0=自适应全量） |
| `currentUserId` | `string \| null` | 当前选中的用户 ID |
| `currentHistoryId` | `string \| null` | 当前选中的历史记录 ID |
| `theme` | `"light" \| "dark"` | 主题（写入 localStorage + class） |
| `currency` | `string` | 显示货币 CNY/USD（写入 localStorage） |
| `activeView` | `"users" \| "pinned" \| "stats" \| "trash" \| "logs" \| "settings"` | 当前视图 |
| `modals` | 对象（11个 boolean） | userDetail / addAmount / subtractAmount / addUser / deleteUser / settings / stats / trash / logs / editHistory / deleteHistory |
| `dataVersion` | `number` | 数据版本计数器 |
| `bumpDataVersion()` | 方法 | 递增 dataVersion，触发依赖组件重算 |

**2. 业务状态**（`VIPManager.state`）：users / recentViewed / trash / logs / syncState

### 货币系统

- 显示货币（`currency`）：控制界面符号，CNY（¥）或 USD（$），存 localStorage + zustand
- 基础货币（`baseCurrency`）：数据实际计价单位，默认 CNY，存 localStorage
- 汇率：CNY→USD = 1/7.25，USD→CNY = 7.25
- 导入时自动检测货币差异并转换

---

## 工具函数

文件：`src/lib/utils.ts`

| 函数 | 说明 |
|------|------|
| `formatAmount(n, currency?)` | 金额格式化（千分位 + 2 位小数 + 货币符号） |
| `formatDate(s)` | 日期格式化（zh-CN locale） |
| `formatDateTime(s)` | 日期时间格式化（zh-CN locale） |
| `getOperationText(type, amount)` | 操作文字：充值/消费 + 金额 |
| `generateId()` | 生成唯一 ID（36进制时间戳 + 随机数） |
| `pad2(n)` | 补零到 2 位 |
| `formatDateForFilename(date)` | 日期转文件名格式（yyyyMMdd-HHmmss） |
| `downloadJSON(obj, filename)` | 触发 JSON 下载 |
| `cn(...inputs)` | className 拼接（仅 filter+join，不含 tailwind-merge） |
| `getBaseCurrency()` | 获取基础货币 |
| `setBaseCurrency(c)` | 设置基础货币 |
| `getConversionRate(from, to)` | 获取汇率 |

**注意**：`cn()` 不含 `tailwind-merge` 逻辑，className 冲突需手动处理。

---

## CSS 约定

文件：`src/index.css`

### Tailwind 配置
- 使用 `@import "tailwindcss"` 导入
- `@variant dark (&:where(.dark, .dark *))` — Tailwind v4 dark mode 变体
- `@theme` 自定义色板：primary(#165DFF), secondary(#FF7D00), success(#00B42A), warning(#FF7D00), danger(#F53F3F), info(#86909C), light(#F2F3F5), dark(#1D2129), darker(#14171F)

### 自定义 CSS 工具类

| 类名 | 说明 |
|------|------|
| `card-shadow` | 卡片阴影（含 ring 效果，dark 适配） |
| `hover-scale` | hover 上浮 + 阴影加深（transition 0.2s） |
| `fade-in` | 淡入 + 上移动画（0.4s） |
| `count-up` | 缩放弹入动画（0.6s） |
| `slide-up` | 底部滑入（0.3s） |
| `nav-indicator` | 导航激活指示条（左侧 3px 蓝色竖条） |
| `nav-active` | 激活 `nav-indicator` 的父类 |
| `action-buttons` | 默认隐藏，`.history-item:hover` 时显示 |
| `history-item` | 历史记录行容器 |
| `history-note` | 历史记录备注文字（小号灰色） |
| `animate-shake` | 抖动动画（删除确认） |
| `animate-pulse-danger` | 红色脉冲（删除确认） |
| `animate-fade-in` | 淡入（0.2s） |
| `animate-slide-in` | 滑入 + 缩放（0.3s） |
| `animate-slide-up` | 底部滑入（0.3s，移动端弹窗） |
| `animate-count-up` | 数字弹入（0.5s） |

### 滚动条样式
- 全局 8px 宽度，浅灰轨道 + 圆角滑块，dark 模式适配

---

## 关键业务规则

### 用户标识
- **新用户**：11 位手机号，`id = phone`，`tail = phone.slice(-4)`
- **旧用户**：4 位尾号，`id = "old-{tail}"`，`phone = ""`
- 添加用户时自动排重

### 软删除与回收站
- `deleteUser(id)`：设置 `deleted=true` + `_deletedAt` 时间戳，移入 `trash[]`
- `restoreFromTrash(id)`：恢复（清除 deleted 标记，移出 trash）
- `purgeTrashItem(id)`：彻底清除（设置 `purged=true`），不可恢复
- `clearTrash()`：清空全部软删除用户

### 历史记录操作
- 充值和消费均追加到 `user.history[]` 末尾
- `editHistory` / `deleteHistory` 会自动重新计算用户余额
- 历史记录 id 由 `generateHistoryId()` 生成

### 最近浏览
- `addRecentView(userId)` 添加到列表头部，去重，保留最近 20 条
- 初始化时会尝试从 localStorage 迁移旧版 `recentViewed` 数据

### 导入导出
- JSON 格式（`ExportPayload` 类型），含用户数据、最近浏览、回收站、日志、设置
- 支持 `overwrite`（覆盖）和 `merge`（合并，recentViewed 取并集去重保留 20 条）
- 导入时自动检测货币差异并转换

### 分页与自适应
- `usersPerPage=0` 为自适应全量模式（不分页）
- 设置面板可选值：8 / 12 / 16 / 20 / 24
- 搜索/筛选/切换页数时自动重置 `currentPage` 为 1

### 移动端适配
- 桌面端（≥768px）：显示 Sidebar 侧边栏
- 移动端（<768px）：底部弹出菜单（bottom sheet）+ 浮动导航按钮
- `useViewportInfo` Hook 提供 `isMobile` / `isFullscreen` 检测

### 登录态切换
- 登出后：清空内存业务数据 → `mgr.init("local_offline")` → `rerender()`
- 离线数据库：未登录时使用 `local_offline` 用户 ID

---

## 注意事项

- 所有 .ts/.tsx 文件使用 UTF-8 编码
- 不要修改 `src/vite-env.d.ts`
- 修改 `src/types/index.ts` 时确保所有引用处同步更新
- `StatsModal` 使用 `React.lazy` 懒加载，外层包裹 `<Suspense fallback={null}>`
- `ErrorBoundary` 是类组件，包裹整个 App，不要改为函数组件
- `VIPManager` 通过 `createVIPManager()` 工厂创建，在 `useVIPManager` hook 中以模块级单例维护
- `db.ts` schema 当前为 v2，修改时需递增版本号
- `cn()` 无 `tailwind-merge` 逻辑（仅简单 join），className 冲突需手动处理
- 禁止批量删除文件或目录（如 `del /s`、`rm -rf`、`Remove-Item -Recurse`）
- 删除文件时只能逐文件删除
