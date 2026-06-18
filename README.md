# 候鸟 300 · 艺术家驻地线上展示平台

> 候鸟 300 是面向青年艺术家的驻地与展示项目。这套平台让每一位驻地艺术家在
> `/upload` 填写名字 + 联系方式后即可上传作品，公开页面 `/<artist-slug>` 实时展示，**多端同步**。
> 未来计划在右侧集成基于 Step 3.7 Flash 的"AI 作品检索"，按主题 / 风格 / 媒介
> 帮助来访者找到他想看的作品（**功能开发中**）。

站点本身保持纯静态、可部署到 GitHub Pages，运行时数据全部托管给
[Supabase](https://supabase.com)（Postgres + Storage 一体，免费额度
500MB DB / 1GB 存储 / 2GB 带宽）。

## ✨ 特性

- 零注册门槛：艺术家填名字 + 联系方式即可上传
- 多艺术家：每位艺术家独立的 `/<slug>` 展示页
- **多设备同步**：Supabase 后端统一存储，任何设备打开都能看到
- 在线上传：拖拽 + 标题/描述编辑 + 进度条
- 瀑布流展示：justified-layout 自适应排版 + GLightbox 灯箱
- 内置 mock 模式：未配置 Supabase 时自动用预设种子数据演示 UI
- **AI 作品检索（开发中）**：右侧抽屉式入口，调用 Step 3.7 Flash 按自然语言查找作品

## 🚀 快速上手

### 1. 注册 Supabase

打开 [supabase.com](https://supabase.com) → "Start your project"，用 GitHub 登录最快。

### 2. 创建项目

控制台点 **New project**：

| 字段 | 建议值 |
|---|---|
| Name | `photo-portfolio`（随意） |
| Database Password | 任意 16 位强密码（记一下，本项目不直接用） |
| Region | **Singapore (Southeast Asia)** ← 国内访问最快 |
| Plan | Free |

等 ~2 分钟，状态变成 "Project is ready"。

### 3. 一次性建表 + Bucket + 权限

左侧 **SQL Editor** → **New query** → 全选粘贴下方 → 点 **Run**：

```sql
-- 1. photos 元数据表
create extension if not exists "pgcrypto";

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  artist_slug text not null,
  artist_name text not null,
  artist_contact text not null,
  collection_slug text not null,
  collection_name text not null,
  title text default '',
  description text default '',
  storage_path text not null,
  width int not null,
  height int not null,
  format text not null,
  created_at timestamptz not null default now()
);

create index if not exists photos_artist_idx on public.photos(artist_slug);
create index if not exists photos_created_at_idx on public.photos(created_at desc);

alter table public.photos enable row level security;

drop policy if exists "anyone can read photos" on public.photos;
create policy "anyone can read photos" on public.photos for select using (true);

drop policy if exists "anyone can insert photos" on public.photos;
create policy "anyone can insert photos" on public.photos for insert with check (true);

-- 2. 创建 photos 公共 bucket
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do update set public = true;

-- 3. Bucket 权限（任何人可读 / 可上传）
drop policy if exists "anyone can read photos bucket" on storage.objects;
create policy "anyone can read photos bucket"
  on storage.objects for select
  using (bucket_id = 'photos');

drop policy if exists "anyone can upload to photos bucket" on storage.objects;
create policy "anyone can upload to photos bucket"
  on storage.objects for insert
  with check (bucket_id = 'photos');
```

跑完应该看到 `Success. No rows returned`。

### 4. 拿凭证

左下齿轮 **Project Settings** → **API**，复制：

- **Project URL**：形如 `https://xxxxxxxx.supabase.co`
- **Project API keys → anon public**：一长串 JWT 字符串

> ⚠️ **不要复制 service_role 那一栏** —— 那是 root 权限。anon key 是设计给前端用的，公开安全。

### 5. 填配置

编辑 `site.config.mts`：

```ts
supabase: {
  url: 'https://xxxxxxxx.supabase.co',
  anonKey: 'eyJhbGciOi...',
  bucket: 'photos',
},
```

### 6. 跑起来

```bash
npm install
npm run dev
```

访问 http://localhost:4321/astro-photography-portfolio/upload/，传几张图，**换浏览器/换设备**打开 `/<你的slug>/`，能看到刚才上传的图就成。

### 7. 部署到 GitHub Pages

```bash
git add . && git commit -m "configure supabase"
git push
```

GitHub Actions（仓库自带 `.github/workflows/deploy.yml`）会自动构建 + 部署。

## 📐 架构概览

```
┌──────────────┐  XHR    ┌──────────────────────┐
│ /upload      │ ──────▶ │ Supabase Storage      │
│ 浏览器表单    │         │  - photos/ bucket     │
└──────┬───────┘         │  - 公共 read/write    │
       │ INSERT          └──────────────────────┘
       ▼
┌──────────────────────┐                          
│ Supabase Postgres    │ ◀──── PostgREST SELECT ──┐
│  - photos 元数据表    │                          │
└──────────────────────┘                          │
                                                  │
┌─────────────────────────────────────────────┐   │
│ Astro 静态站点（GitHub Pages 部署）          │   │
│  /                  首页（最近 24 张）       │ ──┘
│  /artists           艺术家卡片列表           │
│  /<slug>/           单艺术家页（404 fallback）│
│  /collections/      collection 标签聚合      │
│  /upload/           上传配置页              │
└─────────────────────────────────────────────┘
```

### 关键技术点

- **数据流**：上传时先 XHR PUT 到 Storage（带进度），再 INSERT 一行到 photos 表。展示页 fetch `/rest/v1/photos?select=*&order=created_at.desc` 拿全部行，前端按 artist_slug / collection_slug 过滤。
- **XHR for upload, SDK for queries**：Supabase JS SDK 用 fetch 不暴露上传进度。Storage 上传用 XHR 直接调 REST 端点拿进度；DB 查询/INSERT 走 SDK。
- **404.html SPA fallback**：`src/pages/[artist].astro` 用占位 slug 构建一份 HTML，postbuild 复制成 `dist/404.html`，让 `/<slug>/` 直链在 Pages 上能正常 fallback。
- **mock 模式**：site.config 中 url/anonKey 还是 `YOUR_*` 占位时自动启用，使用 23 张 picsum 占位图 + localStorage 存模拟上传，用于无后端的 UI 预览。

## 🗂 目录速览

```
src/
├── lib/photos.ts              # Supabase 数据访问 + mock 数据
├── pages/
│   ├── upload.astro           # 上传配置页
│   ├── [artist].astro         # /<slug>/ 展示页（同时是 404.html 源）
│   ├── artists.astro          # 艺术家列表
│   ├── collections/index.astro# collection 聚合
│   ├── index.astro            # 首页
│   └── about.astro            # 关于
├── components/
│   ├── NavBar.astro           # 含 Upload 入口
│   └── FeaturedGallery.astro  # 首页精选墙
├── scripts/photo-grid.ts      # justified-layout + GLightbox
└── data/                      # 旧 yaml 路线（保留但 MVP 不用）
scripts/postbuild.mjs          # 复制 [artist] 壳到 404.html
```

## 🛡 已知限制

- **无身份认证**：任何人可用任意 slug 上传，存在伪冒可能。后续可加 PIN 校验或迁到 Supabase Auth。
- **无在线删除**：anon 用户只能 INSERT。删除需在 Supabase 控制台手动操作。
- **dev 模式直链不工作**：`/artist-01/` 这种路径只在生产构建后通过 404 fallback 起作用，dev 用 `?slug=artist-01` 测试。
- **Free tier 无图片转换**：Supabase Storage 转换属 Pro 功能。本站目前直接发原图（无 srcset）。

## 📄 License

MIT，继承自原模板。
