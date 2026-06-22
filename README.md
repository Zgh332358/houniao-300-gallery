# 候鸟 300 · AI 语音艺术家展廊

> 让每位艺术家用自己**克隆的声音**,配合 AI 自动写的解说词,**自动语音导览**自己的作品。
> 双语文案 / 一句话检索 / 内容审核全由 StepFun 多模态模型支撑。访客侧零 Key,只播放预生成的 mp3。

灵魂功能:**艺术家声音克隆 + AI 解说词 → 展示时自动语音介绍画作**。其余 AI 能力围绕它服务。

纯静态站点,部署到 GitHub Pages;运行时数据托管 [Supabase](https://supabase.com)(Postgres + Storage 免费额度 500MB / 1GB / 2GB)。

---

## ✨ 特性

- **🎙️ 声音克隆 + 自动语音导览(灵魂)**:艺术家就地录 5~10s 授权样本,StepFun `stepaudio-2.5-tts` 克隆音色;发布作品时 AI 写 1~3 句解说词,自动合成该艺术家声音的 mp3;访客侧零 Key 直接听,可一键自动顺序导览
- **6 步引导式上传向导**:`/upload/setup → identity → voice → collection → photos → publish`,每步一页,顶部 sticky 进度条,前置不全自动跳回;每页有进场/离场动画
- **✨ AI 作品助手(BYOK)**:用户先自己写中文标题和描述,**主动**点「AI 识图」让 `step-3.7-flash` 给一版独立草稿(中英标题/描述/五维标签/策展短评 + 内容审核),「采用」按钮一键复制到自己字段;聊天框专改 AI 草稿不动用户原稿
- **🔍 自然语言找作品**:`/search` 一句话描述就给结果,模型不可用时降级到关键词匹配
- **就地录音**:浏览器 MediaRecorder + Web Audio 内置转 WAV(无依赖)→ 直接走 StepFun `/v1/files` 上传;不用让艺术家自己准备录音文件
- **多设备同步**:Supabase 后端统一存储,任何设备打开都能看到
- **隐私优先**:联系方式从设计上就不进任何匿名可读路径(RLS + 列级 SELECT 双保险)
- **BYOK 安全**:StepFun API Key 永远只存艺术家本机 `localStorage`,不入仓库、不进 URL、不经过服务器
- **内置 mock 模式**:未配置 Supabase 时自动用 23 张种子图演示 UI,纯前端跑得动

---

## 🗺️ 上传向导(用户视角)

| 步骤 | 路由 | 干什么 |
|---|---|---|
| ① AI 助手设置 | `/upload/setup/` | 粘贴 StepFun API Key + 选多模态模型(默认 `step-3.7-flash`) |
| ② 你是谁 | `/upload/identity/` | 显示名 + 联系方式(私) → 自动生成 slug |
| ③ 你的声音 | `/upload/voice/` | 朗读固定提示词 → 浏览器录音 → 转 WAV → 克隆 → 试听确认 |
| ④ 作品集 | `/upload/collection/` | 起一个集子名 |
| ⑤ 选图 + AI 文案 | `/upload/photos/` | 拖图,自己写标题/描述,点 AI 识图拿建议,聊天改 AI 草稿,采用回自己字段 |
| ⑥ 发布 | `/upload/publish/` | 一键发布:上传图 + 写元数据 + 生成解说词 + 合成 mp3 + 写回 |

老 `/upload/` 自动跳转到 `/upload/setup/`。

---

## 🚀 快速上手

### 1. 新建 Supabase 项目

[supabase.com](https://supabase.com) → Start your project,推荐 GitHub 登录最快。

**New project**:
- Name 随意
- Region 选 **Singapore (Southeast Asia)**(国内访问最快)
- Plan **Free**

等 ~2 分钟,状态变成 "Project is ready"。

### 2. 初始化数据库

控制台 **SQL Editor** → **New query**:

#### 2.1 基础表(粘下面整段执行)

```sql
-- photos 元数据表 + photos bucket + 公共读写策略
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

insert into storage.buckets (id, name, public) values ('photos', 'photos', true)
  on conflict (id) do update set public = true;

drop policy if exists "anyone can read photos bucket" on storage.objects;
create policy "anyone can read photos bucket"
  on storage.objects for select using (bucket_id = 'photos');
drop policy if exists "anyone can upload to photos bucket" on storage.objects;
create policy "anyone can upload to photos bucket"
  on storage.objects for insert with check (bucket_id = 'photos');
```

#### 2.2 声音克隆 + 双语 + AI 字段(migration 0001,必须)

把 [`supabase/migrations/0001_artists_voice_artworks.sql`](supabase/migrations/0001_artists_voice_artworks.sql) 全文粘进 SQL Editor 执行 —— 加 `artists` 表、`audio` bucket、`photos` 加双语/解说/审核列、RLS 把 contact 关进黑屋。

**不跑这一步,声音克隆登记后无法落库、发布时解说 mp3 没地方放**。

详见 [`supabase/migrations/README.md`](supabase/migrations/README.md)。

### 3. 拿凭证 + 填配置

控制台齿轮 **Project Settings → API**,复制:

- **Project URL**:`https://xxxxxxxx.supabase.co`
- **Project API keys → anon public**:一长串 JWT

> ⚠️ 不要复制 **service_role**(root 权限,绝不能进前端)。anon key 设计上前端公开安全。

编辑 [`site.config.mts`](site.config.mts):

```ts
supabase: {
  url: 'https://xxxxxxxx.supabase.co',
  anonKey: 'eyJhbGciOi...',
  bucket: 'photos',
}
```

### 4. 跑起来

```bash
npm install
npm run dev
# http://localhost:4321/houniao-300-gallery/
```

部署到 GitHub Pages:`git push` 后 `.github/workflows/deploy.yml` 自动构建+发布。

---

## 🧠 AI 调用链路(BYOK 直连,无后端)

StepFun 三个端点对浏览器开放 CORS,前端直接用艺术家自己的 key 调,**不经过我们任何服务器**。

| 用途 | Endpoint | 模型 |
|---|---|---|
| 读图 / 文案 / 对话 / 审核 / 检索 | `https://api.stepfun.com/step_plan/v1/chat/completions` | `step-3.7-flash`(默认,可改) |
| 上传音色样本 | `https://api.stepfun.com/v1/files` | — |
| 音色克隆 | `https://api.stepfun.com/v1/audio/voices` | `stepaudio-2.5-tts`(**写死**) |
| 语音合成 | `https://api.stepfun.com/v1/audio/speech` | `stepaudio-2.5-tts`(**写死**) |

- Key 只存艺术家本机 `localStorage`(key `pf:step-key:v1`),不写入仓库、不进 URL
- 多模态模型默认 `step-3.7-flash`,可在 `/upload/setup/` 改为其它视觉模型(`localStorage` key `pf:step-model:v1`)
- 语音模型固定 `stepaudio-2.5-tts`,克隆 + 合成同一个;克隆时把朗读提示词原文也传 `text` 字段,服务端 ASR 校验避免 CER_NOT_PASS
- chat 请求体带 `reasoning_effort: "minimal"`,跳过 reasoning 链,识图从 8~15s 降到 2~4s

全部逻辑在两个文件:
- [`src/lib/ai.ts`](src/lib/ai.ts):`analyzePhoto` / `chatRevise` / `generateNarrationText` / `searchByQuery`
- [`src/lib/ai-voice.ts`](src/lib/ai-voice.ts):`uploadVoiceSample` / `cloneVoice` / `synthesizeSpeech`

---

## 🏗 架构

```
┌───────────────────────────────────────────────────────────┐
│ 浏览器(纯静态)                                            │
│                                                             │
│   /upload/setup     ┐                                       │
│   /upload/identity  │                                       │
│   /upload/voice     │  Wizard:localStorage + IndexedDB     │
│   /upload/collection│  跨页面状态,刷新不丢                  │
│   /upload/photos    │                                       │
│   /upload/publish   ┘                                       │
│       │                                                     │
│       ├── BYOK key(localStorage)                          │
│       │                                                     │
└───────┼─────────────────────────────────────────────────────┘
        │
        │ XHR/fetch                  Authorization: Bearer <用户的 key>
        │
        ▼
┌────────────────────────┐  ┌─────────────────────────────┐
│ Supabase               │  │ StepFun API                  │
│ - photos / artists 表   │  │ - chat/completions(读图,    │
│ - photos / audio bucket│  │   文案,审核,检索,生解说词)  │
│ - RLS + 公开视图        │  │ - audio/voices(克隆)         │
└────────────────────────┘  │ - audio/speech(合成 mp3)     │
                            │ - files(音色样本上传)         │
                            └─────────────────────────────┘
```

访客侧浏览展廊:`/`, `/artists/`, `/<slug>/`, `/search/`, `/about/` —— 零 Key,只从 Supabase 公开视图读 + 播放预生成 mp3。

---

## 🗂 目录速览

```
src/
├── layouts/
│   ├── MainLayout.astro          # 全站壳:NavBar + Footer(AI 合成披露)
│   └── WizardLayout.astro        # 6 步向导壳:stepper + 内容 + 进出场动画
├── components/
│   ├── NavBar.astro              # 顶部导航
│   ├── Footer.astro              # 底部 + 社交链接 + AI 合成声明
│   ├── UploadStepper.astro       # 向导 sticky 进度条
│   ├── JourneyPreview.astro      # 首页 5 步流程预览
│   ├── LandingHero-1.astro       # 首屏标题 + 两个 CTA
│   ├── FeaturedGallery.astro     # 首页精选墙
│   ├── FeaturedWorkScroll.astro  # 首屏向下滚动提示
│   ├── PhotoGrid.astro           # 瀑布流容器
│   └── SocialIcon.astro          # 小红书 / IG 图标
├── lib/
│   ├── ai.ts                     # 多模态 chat(读图/文案/对话/审核/检索)
│   ├── ai-voice.ts               # 音色克隆 + 语音合成(stepaudio-2.5-tts)
│   ├── wav.ts                    # 浏览器录音 → WAV 转码(无依赖)
│   ├── wizard.ts                 # 上传向导状态:localStorage 文本 + IDB 图片
│   ├── photos.ts                 # Supabase photos 表 + photos bucket + mock 数据
│   └── artists.ts                # Supabase artists 表 + audio bucket(声音样本)
├── pages/
│   ├── index.astro               # 首页
│   ├── about.astro               # /about(AI 合成声明专章)
│   ├── artists.astro             # 艺术家列表
│   ├── collections/index.astro   # collection 聚合
│   ├── search.astro              # 自然语言检索
│   ├── [artist].astro            # /<slug>/(也作为 404 fallback)
│   ├── upload.astro              # 老 /upload/ → 自动跳转 /upload/setup/
│   └── upload/
│       ├── setup.astro
│       ├── identity.astro
│       ├── voice.astro
│       ├── collection.astro
│       ├── photos.astro
│       └── publish.astro
├── scripts/photo-grid.ts         # justified-layout + GLightbox
└── styles/global.css

supabase/migrations/
├── README.md                      # 怎么执行 + 文件清单
└── 0001_artists_voice_artworks.sql # 声音 + 双语 + AI 字段

scripts/postbuild.mjs              # 复制 [artist] 壳 → dist/404.html
.github/workflows/                 # deploy / test / quality CI
```

---

## 🔒 合规与安全

- **声音克隆**:仅克隆艺术家本人声音;UI 强制勾选授权,记录 `consent_at`;不允许克隆他人/名人/第三方
- **AI 合成披露**:所有合成语音的播放处与 `/about` 标注「音频由 AI 合成」(Spec 强制 + StepFun 文档要求)
- **API Key**:StepFun key 是会花钱的凭证 —— 永不入库、不入仓库、不进前端常量、不进 URL;只存触发调用那位用户的 `localStorage`
- **联系方式**:不进任何匿名可读路径;RLS + 显式 SELECT 列 + `artists_public` 视图三重保护
- **数据库变更**:只生成 [`supabase/migrations/*.sql`](supabase/migrations/),由人工到控制台执行,代码层面绝不直连库跑 SQL

---

## 🛠 已知限制

- **无身份认证**:任何人可用任意 slug 上传,有伪冒可能。生产环境建议接 Supabase Auth 或加 PIN
- **无在线删除**:anon 用户只能 INSERT。删除需到控制台手动
- **dev 模式直链不工作**:`/artist-01/` 直链只在生产构建 + 404 fallback 后工作。dev 用 `?slug=artist-01` 测试
- **Free tier 无图片转换**:Supabase Storage 转换属 Pro 功能,本站发原图(无 srcset)
- **mock 模式声音不通**:mock 模式下音色样本和解说 mp3 不会真上传(没有 audio bucket),所以访客侧听不到。真要演示走通,跑完 migration 0001 后切到 live 模式

---

## 📄 License

MIT。
