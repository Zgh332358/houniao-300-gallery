# 候鸟 300 · 艺术家驻地线上展厅

> **一个手机号 = 一个画廊**。AI 自动写元数据、识图、检索、做 3 种动态展示。
> 静态 Astro 站点 + Supabase 后端 + StepFun step-3.7-flash 当 AI 大脑,纯 BYOK 直连,部署到 GitHub Pages。

线上:[zgh332358.github.io/houniao-300-gallery](https://zgh332358.github.io/houniao-300-gallery/)

---

## ✨ 一句话产品

驻地艺术家用手机号「轻登录」拿一个 `/<phoneHash8>/<slug>/` 专属画廊页 → 上传作品时 step-3.7-flash 同时识图、写双语标题描述、打 5 维标签、给策展短评 → 发出 URL 让人浏览 → 还能挑几张图绑一种动态布局(3D 旋转 / 堆叠卡片 / 全屏 scroll-snap)做成独立可分享的「动态展示」。

---

## 🎯 核心功能

### 身份与登录(荣誉系统)
- **手机号轻登录**:输手机号即可,无 SMS、无 PIN。客户端 SHA-256(phone + salt) 后送 DB,**明文手机号永远不出浏览器**
- **复合身份 URL**:`/<phoneHash8>/<slug>/`,前 8 位 hash + slug 联合唯一,两个艺术家都叫 Given 互不干扰
- **owner 模式自动识别**:登录手机号的完整 hash 跟当前画廊匹配,才显示编辑按钮

### 上传向导(5 步)
| 步 | 路由 | 干啥 |
|---|---|---|
| ① AI 助手设置 | `/upload/setup/` | 粘 StepFun API Key(只存本机 localStorage),模型锁死 `step-3.7-flash` |
| ② 你是谁 | `/upload/identity/` | 显示名 + 联系方式 + slug;首次注册点「创建画廊」绑 phone_hash |
| ③ 作品集 | `/upload/collection/` | 起作品集名 |
| ④ 选图 + AI 文案 | `/upload/photos/` | 拖图 → AI 识图 → 用户与 AI 对话改草稿 → 「采用」回自己字段 |
| ⑤ 发布 | `/upload/publish/` | 一键上传:图 → Storage,元数据 → photos 表 |

### AI 能力(全 step-3.7-flash 驱动)
- **🖼️ 识图 → 元数据**(`analyzePhoto`):一次请求返回中英文标题、中英文描述、5 维标签(主题/风格/媒介/色调/情绪)、策展短评、内容审核结果
- **💬 对话改稿**(`chatRevise`):用户在 AI 草稿旁边对话,模型只改自己的草稿不动用户原稿
- **🔮 自然语言找作品**(`searchByQuery`):一句话描述(主题/情绪/色调/媒介自由组合),模型按全量作品的元数据排出 ids,无 key 时降级关键词
- **🏷️ 标签云**:全站所有 photos.tags 聚合后,按 5 维分行展示,点了直接搜

### 画廊与展示
- **画廊页** `/<hash8>/<slug>/`:justified-layout 瀑布流 + GLightbox 灯箱,每张图右下 title 角标
- **「动态展示」section**:画廊页头部下方独立卡片网格,封面图 + emoji + 标题 + 张数
- **三种 layout** (单 URL 沉浸式)
  - 🎞️ **Coverflow**:Swiper 3D 旋转木马,中央正放两侧 28° 后倾
  - 🃏 **Cards**:Swiper Tinder 风格发牌切换
  - 📜 **Snap**:纯 CSS scroll-snap-y mandatory + IntersectionObserver fade-in
- **show URL** `/<hash8>/<slug>/show/<id>/`:全屏,顶部黑条只剩「← 回画廊 / 标题 / 元信息」,nav 自动隐藏

### Owner 编辑模式
- 自己画廊页右上「编辑模式」开关 → 开启后:
  - 每张图右上 ×:删图(级联自动从所有 show 的 photo_ids 里抹掉,空 show 自动删)
  - 每张 show 卡的标题变 input(blur 自动保存 PATCH title),右上 ×:删 show
  - 头部「+ 创建动态展示」按钮 → 打开 modal 多选图 + 选 layout

### 首页
- **流动 marquee**:最新 24 张图横向无限滚,鼠标悬停暂停
- **5 步流程预览**(已被压成 4 步,匹配当前 wizard)
- 顶部 hero:`艺术家驻地线上展厅` + H1 + 微动 ⌄ 引导滚动

---

## 🏗 架构

```
浏览器(静态 Astro 站,纯前端)
    │
    ├── 用户的 StepFun key(只存 localStorage)
    ├── 用户的手机号(SHA-256 hash 后才出浏览器)
    │
    ├── XHR/fetch ──► Supabase
    │                  ├─ photos / artists / shows 表 (RLS + 公开视图)
    │                  └─ photos Storage bucket (公开读)
    │
    └── fetch ──► api.stepfun.com/step_plan/v1/chat/completions
                   step-3.7-flash 多模态(读图/写文案/对话/审核/检索)
```

**没有自家后端** —— GitHub Pages 只 host 静态 HTML/JS/CSS。所有动态都靠 Supabase + StepFun BYOK 直连。

---

## 🌐 URL 结构

```
/                                  首页(marquee + 4 步流程 + 已上线 artists)
/artists/                          所有艺术家卡片
/collections/                      所有作品集
/search/                           自然语言找作品(Step 3.7 + 标签云 + 示例)
/about/                            关于
/login/                            手机号登录入口
/upload/                           → redirect /login/ → /upload/setup/
/upload/{setup,identity,collection,photos,publish}/  上传向导 5 步
/<phoneHash8>/<slug>/              艺术家画廊页
/<phoneHash8>/<slug>/show/<id>/    全屏动态展示
```

非 Astro 静态路径(`<hash8>/<slug>/...`)走 GitHub Pages 全站 `404.html` fallback,客户端 JS 解析 path 后渲染。

---

## 🚀 快速上手

### 1. 新 Supabase 项目

[supabase.com](https://supabase.com) → New project → 区域选 Singapore(国内最快)→ Free plan。

### 2. 跑 8 条 migration

按顺序去 SQL Editor 跑(每条都在 `supabase/migrations/` 下):

| migration | 干啥 |
|---|---|
| `0001_artists_voice_artworks.sql` | 建 artists 表 + 加 photos 双语/标签等列(其中 audio bucket / voice 字段是历史遗留,现在死字段,不影响) |
| `0002_photos_update_narration.sql` | 给 photos 表加 UPDATE policy(历史遗留为了写 narration_*,后来 TTS 拆了,policy 留着不影响) |
| `0003_artists_phone_login.sql` | 加 `phone_hash` + `artists_login_lookup` 视图,登录靠它 |
| `0004_photos_delete_policy.sql` | anon DELETE photos + storage 文件,owner 模式删图必需 |
| `0005_composite_identity.sql` | photos 加 `owner_hash`、artists 改成 (phone_hash, slug) 联合唯一,URL 才能撑住两个同名 Given |
| `0006_shows.sql` | 新建 shows 表 + SELECT/INSERT/DELETE policy |
| `0007_shows_rename.sql` | shows 加 UPDATE policy 但只放行 title 列 |
| `0008_shows_cascade_photo_delete.sql` | photos AFTER DELETE 触发器,自动从 shows.photo_ids 抹掉 + 删空 show |

### 3. 填配置

复制 Project URL + anon key 到 [`site.config.mts`](site.config.mts):

```ts
supabase: {
  url: 'https://xxxxxxxx.supabase.co',
  anonKey: 'eyJhbG...',
  bucket: 'photos',
}
```

⚠️ 永远不要把 service_role key 写进任何前端代码 / 仓库。anon key 设计上前端公开是安全的。

### 4. 跑起来

```bash
npm install
npm run dev          # http://localhost:4321/houniao-300-gallery/
npm run build        # 静态产物到 dist/
```

部署:`git push origin main` → GitHub Pages 自动构建。

### 5. (可选) seed demo 数据

`scripts/seed-demo-photos.mjs` 一次性把 4 位虚构艺术家 + 20 张 CC0 摄影图灌进去(虚拟 US 号 15555550101~04):

```bash
node scripts/seed-demo-photos.mjs              # 检测后跑
node scripts/seed-demo-photos.mjs --dry        # 只打印不写网
node scripts/seed-demo-photos.mjs --force      # 强制重跑
```

---

## 🧠 step-3.7-flash 在做什么

| 用途 | 函数 | 模型调用 |
|---|---|---|
| 读图 → 元数据 | `analyzePhoto(file, history)` | 一次 chat,vision message,要求 JSON 输出含 title/titleEn/description/descriptionEn/tags(5 维)/curatorNote/moderation |
| 对话改稿 | `chatRevise(history, userMsg)` | 多轮 chat,带历史 + 用户最新消息,只改 AI 已生成的草稿 |
| 自然语言搜索 | `searchByQuery(q, all)` | 一次 chat,把全量作品摘要 + 用户 query 喂进去,要求 JSON `{ids: [...]}` 排序 |
| 关键词降级 | `keywordFallbackSearch(q, all)` | 不调模型,纯前端字符串匹配,无 key 时兜底 |

**端点**:`POST https://api.stepfun.com/step_plan/v1/chat/completions`

**Request body 关键**:
```js
{
  model: 'step-3.7-flash',
  messages: [...],
  reasoning_effort: 'minimal',   // 跳 reasoning 链,识图 8-15s → 2-4s
  response_format: { type: 'json_object' },  // 强制 JSON
}
```

完整实现:[`src/lib/ai.ts`](src/lib/ai.ts)

---

## 🔐 安全模型

| 资源 | 强度 | 实现 |
|---|---|---|
| 手机号 | 不出浏览器 | 客户端 SHA-256(phone + 'houniao300-2026') 后再发请求 |
| StepFun API Key | 不出 owner 浏览器 | 只存 `localStorage`,不进 URL / 仓库 / 任何服务器 |
| 谁能改谁的画廊 | **荣誉系统** | RLS 全 `using (true)`,owner 判断只在客户端(session.phone hash === photos.owner_hash) |
| 联系方式 | 物理隔离 | RLS + 列级 grant + `artists_public` 视图三重保护,匿名查不到 |
| 同 slug 撞 | 复合 URL 隔离 | 两个 Given 拿不同 `/<hash8>/given/` |

**强度边界**:跟 Supabase Auth phone OTP 比,我们没有服务端身份。理论上 anon 还能伪造 owner_hash 发图。真生产需要:
- 接 Supabase Auth(phone OTP / magic link),用 `auth.uid()` 改写 RLS
- 服务端校验 owner_hash = jwt 里的 hashed phone

驻地展示规模(< 100 艺术家)目前不上这层。

---

## 📁 目录速览

```
src/
├── layouts/MainLayout.astro    全站壳 + Alpine 启动
├── layouts/WizardLayout.astro  上传向导壳:stepper + 动画
├── components/
│   ├── NavBar.astro              顶部导航(登录态自动显示「我的画廊」)
│   ├── Footer.astro
│   ├── LandingHero-1.astro       首屏 hero
│   ├── FeaturedGallery.astro     首页 marquee
│   ├── FeaturedWorkScroll.astro  首屏底部「向下浏览 ↓」
│   ├── JourneyPreview.astro      4 步流程
│   └── ...
├── lib/
│   ├── ai.ts                     step-3.7-flash 调用层
│   ├── auth.ts                   手机号 hash + 会话
│   ├── photos.ts                 Supabase photos 表 + Storage
│   ├── artists.ts                Supabase artists 表 + login lookup
│   ├── shows.ts                  Supabase shows 表 CRUD
│   └── wizard.ts                 向导状态(localStorage + IndexedDB)
├── pages/
│   ├── index.astro               首页
│   ├── login.astro               手机号登录
│   ├── about.astro / artists.astro / collections/index.astro / search.astro
│   ├── upload.astro              redirect → /login
│   ├── upload/{setup,identity,collection,photos,publish}.astro
│   └── [phone]/[slug].astro      画廊页 + show 页(URL 解析切模式)
├── scripts/
│   ├── photo-grid.ts             justified-layout + GLightbox
│   └── show-viewers.ts           Swiper Coverflow / Cards + 纯 CSS Snap
└── styles/global.css

supabase/migrations/             0001 ~ 0008
scripts/
├── seed-demo-photos.mjs         一次性灌 demo 数据
└── postbuild.mjs                复制占位 → dist/404.html

docs/
└── workshop-step-3.7-flash.md   workshop 教程
```

---

## 🛠 技术栈

- [Astro 5](https://astro.build/) — 静态站点 + island 模式
- [Tailwind CSS 4](https://tailwindcss.com/) — 工具类样式
- [Alpine.js 3](https://alpinejs.dev/) — 轻量响应式
- [Supabase](https://supabase.com/) — Postgres + Storage(免费)
- [Swiper 11](https://swiperjs.com/) — Coverflow / Cards 动效
- [GLightbox](https://biati-digital.github.io/glightbox/) — 灯箱
- [justified-layout](https://github.com/flickr/justified-layout) — 瀑布流
- [StepFun step-3.7-flash](https://platform.stepfun.com/) — 多模态 AI

部署:GitHub Pages(免费)。

---

## ⚠️ 已知限制

- **没有真服务端 auth** —— 荣誉系统,详见上面安全段
- **dev 模式直链不工作** —— `/<hash8>/<slug>/` 走 GH Pages 404 fallback,只有生产构建后能用。dev 用 `?phone=xxx&slug=yyy` query 测试
- **GitHub Pages 大陆访问偶发不通** —— Cloudflare/Fastly 节点在大陆时通时不通
- **Supabase Free 不带图片转换** —— `srcSet` 是空字符串,直返原图
- **音色 / 解说功能已下线** —— 0001/0002 migration 里 narration_* / audio bucket / artists.voice_id 字段是历史遗留,死字段不动,前端已完全不引用

---

## 🗺 Migration 时间线(项目演化记录)

- **M0** 静态 Astro 框架 + photos 表
- **0001** 加 artists / audio bucket / 双语字段(那时候还想做 AI 语音导览,后来移除了)
- **0002** photos UPDATE policy(为了写 narration_path,现在用来改 owner 字段)
- **0003** phone_hash 登录
- **0004** photos DELETE policy(owner 模式删图)
- **0005** 复合身份 URL 重构
- **0006** shows 表
- **0007** shows rename(只放 title 列)
- **0008** photos→shows 级联删除触发器

---

## 📄 License

MIT
