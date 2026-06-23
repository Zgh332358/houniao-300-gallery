# Workshop · 用 Step 3.7 Flash 做一个有 AI 的前端网页

> 拿候鸟 300 这个项目当样板,讲清楚 **step-3.7-flash 在一个真前端里到底承担了什么**,然后教你**怎么把这套模式抄走**,套到你自己的项目里。
>
> 全文 = Part 1 + Part 2 + 一个 30 分钟动手 demo + 常见踩坑。

---

## 准备

- 一把 [StepFun API Key](https://platform.stepfun.com)(注册送试用额度,够本 workshop 跑很多次)
- Node 22+(只为本地预览,部署不需要 Node)
- 一个支持 `fetch + crypto.subtle` 的浏览器(任何现代浏览器都 OK)
- 30 分钟到 1 小时

---

# Part 1 · step-3.7-flash 在这个项目里承担了哪些 AI 能力

候鸟 300 是个**纯前端**站点,没有自家后端 —— 所有 AI 调用都是浏览器**直连** `api.stepfun.com`,artist 用自己的 Key 跑(BYOK)。3.7-flash 在这里承担了 4 个独立但相关的能力:

| 能力 | 函数(src/lib/ai.ts) | 触发场景 |
|---|---|---|
| 🖼️ 读图 → 全套元数据 | `analyzePhoto` | 艺术家上传一张图,点「AI 识图」 |
| 💬 对话改稿 | `chatRevise` | 艺术家觉得 AI 写的不对,在草稿旁说一句「再含蓄点」 |
| 🔮 自然语言找作品 | `searchByQuery` | 访客在 /search 输「看一会儿想哭的人像」 |
| 🩹 关键词降级 | `keywordFallbackSearch` | 用户没填 Key 时兜底,纯前端字符串匹配 |

---

## 1.1 读图 → 一次性返回 7 个字段

最值得抄的一招:**一次 vision chat 就让模型同时给出所有元数据,而不是分多次问**。

调用形态:

```ts
// src/lib/ai.ts:analyzePhoto
const dataUrl = await fileToAiDataUrl(file, 1024, 0.85);  // 压到 1024px / q85

const messages = [
  { role: 'system', content: ANALYZE_SYSTEM_PROMPT },
  {
    role: 'user',
    content: [
      { type: 'image_url', image_url: { url: dataUrl } },
      { type: 'text', text: userText },
    ],
  },
];

const { content } = await stepChat(messages, {
  responseFormat: { type: 'json_object' },
});

const j = JSON.parse(content);
// j 现在包含:
//   { title, titleEn, description, descriptionEn,
//     tags: { theme, style, medium, palette, mood },
//     curatorNote, moderation: { safe, reason, categories } }
```

**关键点**:

- **`image_url` 走 base64 data URL**(不上传到任何中间存储,直接塞 prompt)。`fileToAiDataUrl` 先把图压到 1024px / q85,token 量从几十 K 降到 1~3 K,响应从 8s 降到 2~4s
- **`response_format: { type: 'json_object' }`** 强制模型回 JSON,前端 `JSON.parse` 不爆。配合 system prompt 里**列出每个字段及格式约束**,模型几乎不会写错
- **一次问 7 个字段** 比 7 次问 1 个 token 总量和延迟都低一个数量级,且**字段之间能互相对照**(标签会跟描述呼应,策展短评会照顾到内容审核结论)

System prompt 写法(节选):

```
你是个图片元数据生成器。给你一张图,你要返回严格 JSON,字段:
- title: 中文标题(不超过 12 字,不要标点)
- titleEn: 英文标题(不超过 8 词)
- description: 中文描述(1~2 句,口语化)
- descriptionEn: 英文描述
- tags: { theme, style, medium, palette, mood } 五个 string
- curatorNote: 一句话策展短评(中文,带一点角度)
- moderation: { safe: boolean, reason: string, categories: string[] }

只输出 JSON,不要任何 Markdown 包裹。
```

---

## 1.2 对话改稿 —— 多轮 chat,只动 AI 自己的草稿

artist 看到 AI 给的标题不满意,可以在草稿旁边直接对话:「让标题更含蓄一点」,模型**只改 AI 那版**,不动 artist 自己填的原稿。

```ts
// src/lib/ai.ts:chatRevise
const draft = currentAiDraft;  // 当前 AI 草稿(JSON)
const reviseMsg = {
  role: 'user',
  content: `这是当前 AI 草稿:\n${JSON.stringify(draft)}\n\n用户的修改建议:${userMsg}\n\n输出修改后的完整 JSON,字段不变。`,
};

const { content } = await stepChat(
  [...history, reviseMsg],
  { responseFormat: { type: 'json_object' } },
);
```

**关键点**:

- 历史消息**累加**进 messages 数组,模型保持上下文(自己之前为什么写成那样)
- prompt 里**显式把当前草稿喂回去**,避免模型「记不起来」
- 仍然要求 JSON 结构稳定 —— 模型不会因为对话就乱改 schema

---

## 1.3 自然语言找作品 —— prompt 设计:只让模型排 id,不让它复述内容

`/search` 页让用户用一句话描述想看的(主题 / 情绪 / 色调 / 媒介自由组合)。如果让模型直接生成「推荐 5 张图」的描述文字,token 会爆。我们的做法:**把全量候选作品的精简元数据喂给模型,要求只回排序后的 id 数组**。

```ts
// src/lib/ai.ts:searchByQuery
const candidates = allPhotos.map((p) => ({
  id: p.id,
  title: p.meta.title,
  description: p.meta.description,
  tags: p.tags,
  curatorNote: p.curatorNote,
}));

const messages = [
  { role: 'system', content: SEARCH_SYSTEM_PROMPT },
  {
    role: 'user',
    content: `候选作品(JSON 数组):\n${JSON.stringify(candidates)}\n\n用户搜索:${query}\n\n只回 {"ids":["xxx","yyy",...]} 形式 JSON,把最相关的排前面,无关的不要。`,
  },
];

const { content } = await stepChat(messages, {
  responseFormat: { type: 'json_object' },
});

const ids: string[] = JSON.parse(content).ids;
// 前端拿 ids 去查 photo 详情渲染
```

**关键点**:

- 把候选作品的**摘要**(不是原始巨大对象)喂给模型 —— 100 张图的摘要大概 5K token,3.7-flash 一次能吃下
- 输出格式约束**最严** —— 只返回 id 数组,不要任何描述。token 量小,前端可靠
- 配合 `searchableArtwork` interface,前端、prompt、parse 三方共用一个 schema

---

## 1.4 关键词降级 —— 没 Key 也能搜

如果用户没填 API Key,我们不直接报错,而是降级到纯前端的字符串匹配:

```ts
// src/lib/ai.ts:keywordFallbackSearch
const lowerQ = query.toLowerCase();
const words = lowerQ.split(/\s+/);

return all
  .map((p) => {
    const haystack = `${p.title} ${p.description} ${Object.values(p.tags).join(' ')}`.toLowerCase();
    const score = words.filter((w) => haystack.includes(w)).length;
    return { id: p.id, score };
  })
  .filter((r) => r.score > 0)
  .sort((a, b) => b.score - a.score)
  .map((r) => r.id);
```

体验比 AI 搜差很多(理解不了「想哭的」「梦境般的」),但**站点永不空白**。模型不可用是常态,准备好降级路径就赢一半。

---

# Part 2 · 怎么把这套模式抄走

下面 6 个 recipe 都从这个项目里拆出来,每个独立可拿,合起来够做一个像样的「带 AI 的纯前端站」。

---

## Recipe 1 · BYOK 模式 —— 让用户自带 Key

**为什么**:

- 你不用付 AI 费用(用户自己掏)
- 你不用申请域名级 API 配额
- 你不用做计费 / 限流 / 反爬
- 用户的 Key **永远不出他自己浏览器**,法律/安全风险降到极低

**怎么做**:

```ts
// src/lib/ai.ts(简化)
const KEY_LS = 'pf:step-key:v1';
const MODEL_LS = 'pf:step-model:v1';
const DEFAULT_MODEL = 'step-3.7-flash';

export function getAiConfig() {
  return {
    apiKey: localStorage.getItem(KEY_LS) || '',
    model: localStorage.getItem(MODEL_LS) || DEFAULT_MODEL,
  };
}

export function setAiConfig(c: { apiKey?: string; model?: string }) {
  if (c.apiKey !== undefined) localStorage.setItem(KEY_LS, c.apiKey.trim());
  if (c.model !== undefined) localStorage.setItem(MODEL_LS, c.model.trim() || DEFAULT_MODEL);
}

export function hasAiKey(): boolean {
  return !!localStorage.getItem(KEY_LS);
}
```

UI 模式(简化):

```html
<input type="password" placeholder="sk-..." x-model="apiKey" @input="persist()">
<p>Key 永远只存你本机浏览器,不进 URL / 不入任何服务器。</p>
```

**铁律**:

- 不要进 `localStorage` 以外的任何持久层
- 不要进 URL 参数(浏览器历史 + referrer 会泄露)
- 不要在 git 仓库放任何示例 Key(用 `placeholder` 提示)

---

## Recipe 2 · 浏览器直连 Chat API

**前提**:StepFun 的 chat endpoint 对浏览器 Origin 是开放的(`access-control-allow-origin: *`)。这就允许你完全 zero-backend 跑 AI 应用。

**调用模版**:

```ts
async function stepChat(messages, opts = {}) {
  const cfg = getAiConfig();
  if (!cfg.apiKey) throw new Error('未配置 API Key');

  const body: any = {
    model: cfg.model,
    messages,
    reasoning_effort: 'minimal',  // 见 Recipe 5
  };
  if (opts.responseFormat) body.response_format = opts.responseFormat;

  const res = await fetch('https://api.stepfun.com/step_plan/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Step API HTTP ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const j = await res.json();
  return { content: j.choices[0].message.content };
}
```

**注意端点**:候鸟 300 用的是 `api.stepfun.com/step_plan/v1/chat/completions`(StepPlan 兑换体系的端点)。如果你是普通 StepFun 用户,可能要走 `/v1/chat/completions`。这两条路径**计费体系不同**,以你拿到的 Key 对应的端点为准。

**错误处理常见情况**:

| HTTP | 含义 | 给用户提示 |
|---|---|---|
| 401 | Key 错 / 没传 | 「Key 填错了,回设置检查」 |
| 402 | 配额用完 | 「StepFun 账户余额或试用额度耗尽,去控制台充值」 |
| 403 | Key 没有这个端点的权限 | 「这把 Key 不能调 chat,检查 StepPlan 兑换状态」 |
| 429 | 频率限制 | 「请求太快,等 30s 再试」 |
| 500+ | 服务端 | 「StepFun 后端异常,稍后再试」|

---

## Recipe 3 · Vision message —— 让模型看图

```ts
// 1. 把 File 压缩成 base64 data URL
async function fileToAiDataUrl(file: File, maxEdge = 1024, quality = 0.85): Promise<string> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

// 2. 塞进 messages 数组的 user content(必须是 array,不是 string)
const messages = [
  { role: 'system', content: '描述这张图,1 句中文。' },
  {
    role: 'user',
    content: [
      { type: 'image_url', image_url: { url: dataUrl } },
      { type: 'text', text: '描述图里你看到的核心元素。' },
    ],
  },
];
```

**Tips**:

- **`maxEdge = 1024`** 是性能与精度的甜蜜点。原图 4032×3024 直接发,token 量 25K+;1024 长边压缩后 < 5K,精度肉眼看不出差别
- **JPEG q85** 比 PNG 小 3-5 倍,model 看图不在乎压缩
- 多张图就在 content 数组里多塞几个 `{ type: 'image_url', ... }`

---

## Recipe 4 · 强制 JSON 结构化输出

模型默认会写自然语言,有时还在 JSON 外面包 ```` ```json ```` 代码块。强制结构化:

```ts
body.response_format = { type: 'json_object' };
```

加上这一行,StepFun 会**保证返回的 content 是 valid JSON 字符串**,直接 `JSON.parse` 不爆。

但 system prompt 里仍然要**明示字段** —— `response_format` 只保证 JSON 合法,不保证字段名对。

**容错解析**:

```ts
function safeParseJson(s: string): any {
  // 模型偶尔仍会包代码块(开了 response_format 后概率极低,但保险)
  const cleaned = s
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?\s*```\s*$/, '')
    .trim();
  return JSON.parse(cleaned);
}
```

---

## Recipe 5 · `reasoning_effort: 'minimal'` 提速

step-3.7-flash 默认会先生成 reasoning 链(类似 OpenAI o1 的思考过程),然后才出 final content。简单任务(读图 / 改稿 / 排 id)不需要这个,带这一行加速 3~5 倍:

```ts
body.reasoning_effort = 'minimal';
```

**实测**(识图任务,4032×3024 → 1024 长边):

| reasoning_effort | 延迟 | 输出质量 |
|---|---|---|
| `'high'`(默认) | 8~15s | 略好,有更多反思 |
| `'medium'` | 5~9s | 接近 high |
| `'minimal'` | **2~4s** | 简单任务无可见差异 |

何时该用 `medium` / `high`:

- 需要多步推理的任务(数学、复杂决策)
- 要求模型自己发现矛盾再纠正
- 一般描述 / 翻译 / 分类用 `minimal` 就够

---

## Recipe 6 · 没 Key 也别白屏 —— 降级路径

任何依赖外部 AI 的页面都该有 fallback:

```ts
async function smartSearch(query: string, candidates) {
  if (!hasAiKey()) {
    return keywordFallbackSearch(query, candidates);  // 纯前端
  }
  try {
    return await searchByQuery(query, candidates);    // AI
  } catch (e) {
    console.warn('AI 失败,降级:', e);
    return keywordFallbackSearch(query, candidates);  // 兜底
  }
}
```

UI 里要明确告诉用户当前走的哪条路径:

```html
<span x-show="usedFallback" class="text-amber-700">关键词降级:</span>
共 <span x-text="results.length"></span> 件
```

---

# Part 3 · 30 分钟动手 demo

写一个**单 HTML 文件**,什么框架都不用,粘进浏览器跑。功能:输入 Key → 选张图 → 点按钮 → 显示 step-3.7-flash 看图返回的 JSON。

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>Step 3.7 Flash 看图 demo</title>
  <style>
    body { font-family: system-ui; max-width: 720px; margin: 40px auto; padding: 0 20px; }
    input, button, textarea { font: inherit; padding: 8px; border-radius: 6px; }
    input[type=password] { width: 100%; box-sizing: border-box; }
    button { background: #000; color: #fff; padding: 10px 20px; cursor: pointer; }
    button:disabled { background: #ccc; }
    pre { background: #f5f5f5; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 13px; }
    img { max-width: 100%; border-radius: 6px; margin-top: 12px; }
  </style>
</head>
<body>
  <h1>🔮 Step 3.7 Flash 看图 demo</h1>

  <p>① 填你的 StepFun Key(只存这页 sessionStorage,关页就忘):</p>
  <input id="key" type="password" placeholder="sk-..."
         oninput="sessionStorage.setItem('demoKey', this.value)">

  <p>② 选一张图:</p>
  <input id="file" type="file" accept="image/*" onchange="onFile(event)">
  <img id="preview" alt="" hidden>

  <p>③ 点这里让模型看:</p>
  <button id="go" onclick="go()" disabled>让 step-3.7-flash 看看</button>

  <h3>返回:</h3>
  <pre id="out">(还没跑)</pre>

  <script>
    // 恢复 Key
    document.getElementById('key').value = sessionStorage.getItem('demoKey') || '';

    let dataUrl = null;
    const preview = document.getElementById('preview');
    const goBtn = document.getElementById('go');
    const out = document.getElementById('out');

    async function onFile(e) {
      const file = e.target.files[0];
      if (!file) return;
      dataUrl = await fileToDataUrl(file, 1024, 0.85);
      preview.src = dataUrl;
      preview.hidden = false;
      goBtn.disabled = false;
    }

    async function fileToDataUrl(file, maxEdge, quality) {
      const img = await createImageBitmap(file);
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', quality);
    }

    async function go() {
      const key = document.getElementById('key').value.trim();
      if (!key) { alert('先填 Key'); return; }
      if (!dataUrl) { alert('先选图'); return; }

      goBtn.disabled = true;
      out.textContent = '请求中(2~4 秒)...';

      const messages = [
        {
          role: 'system',
          content:
            '你是图片元数据生成器。返回严格 JSON,字段:title(中文,<=12字)、description(中文,1~2 句)、tags(数组,3~5 个关键词)。',
        },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: dataUrl } },
            { type: 'text', text: '描述这张图。' },
          ],
        },
      ];

      try {
        const res = await fetch(
          'https://api.stepfun.com/step_plan/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({
              model: 'step-3.7-flash',
              messages,
              reasoning_effort: 'minimal',
              response_format: { type: 'json_object' },
            }),
          }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        const j = await res.json();
        const content = j.choices[0].message.content;
        // 试解 JSON,失败就原样显示
        try {
          out.textContent = JSON.stringify(JSON.parse(content), null, 2);
        } catch {
          out.textContent = content;
        }
      } catch (e) {
        out.textContent = '错了: ' + e.message;
      } finally {
        goBtn.disabled = false;
      }
    }
  </script>
</body>
</html>
```

**怎么用**:

1. 保存成 `demo.html`,双击用浏览器打开(或拖进 Chrome)
2. 粘你的 StepFun Key
3. 选一张图(随便什么,自拍 / 风景 / 截图都行)
4. 点「让 step-3.7-flash 看看」
5. 2~4 秒后看到 JSON 输出:

```json
{
  "title": "海岸日落",
  "description": "金色的太阳沉入海平面,云层被染成暖橙。海面平静,一只飞鸟掠过远方。",
  "tags": ["日落", "海岸", "暖色调", "宁静", "自然"]
}
```

这就是候鸟 300 项目 `analyzePhoto` 的核心 —— **一张图、一次请求、结构化 JSON 输出**。从这个 demo 加 6 个字段(中英标题 / 中英描述 / 5 维标签 / 策展短评 / 审核结论)就是候鸟 300 真用的 prompt。

---

# Part 4 · 常见踩坑

| 症状 | 原因 | 修法 |
|---|---|---|
| `HTTP 401` | Key 没传 / 拼错 | 检查 `Authorization: Bearer <key>` 的 key 字符串 |
| `HTTP 402` quota exceeded | 试用 / 充值额度用完 | 去 [platform.stepfun.com](https://platform.stepfun.com) 充值 |
| `HTTP 403` | Key 没有这个端点的权限 | StepPlan 用户走 `/step_plan/v1/`,普通用户走 `/v1/` —— 看你拿到的 Key 对应哪条 |
| 浏览器 CORS error | 用了错的端点 / 写错域名 | 一定要写 `api.stepfun.com`,不要随便改 |
| 返回 content 是带 ```` ```json ```` 的代码块 | 没加 `response_format` | 加 `response_format: { type: 'json_object' }` |
| 识图巨慢 (10s+) | 没加 `reasoning_effort: 'minimal'` 或没压图 | 两个一起开 |
| `JSON.parse` 报错 | 模型偶尔写错 | 用 `safeParseJson` 容错,或 system prompt 里更严格规定字段 |
| 多张图返回质量参差 | 一次问太多 / 没压图 | 一次问 1~2 张;一定先压到 1024 长边 |
| Vision API 报"unsupported content type" | content 写成了 string 而不是 array | user content 是 vision 时**必须**是数组 `[{type:'image_url',...},{type:'text',...}]` |

---

# Part 5 · 进阶方向

如果这个 demo 让你想做点更狠的:

- **Streaming(SSE)**:Chat API 支持 `stream: true`,token 一边生成一边显示,适合长文生成
- **Tool use / function calling**:让模型自己决定调你哪个 JS 函数(例如「搜数据库」「计算价格」),Step 也支持 OpenAI 兼容的 `tools` 字段
- **Multi-turn 长上下文**:存 messages 数组进 IndexedDB,跨会话持续对话
- **批量任务并发 + 队列**:Promise.all + 并发上限控制,避免触发 429
- **服务端 proxy**(如果不想 BYOK):自己起个 Cloudflare Worker / Vercel function 转发,key 藏服务端 —— 但你就要付 AI 钱了

---

# 后记

候鸟 300 整个站点的代码可以当 reference:

- AI 调用全在 [`src/lib/ai.ts`](../src/lib/ai.ts)
- BYOK 配置 UI 在 [`src/pages/upload/setup.astro`](../src/pages/upload/setup.astro)
- 识图整合在 wizard 第 4 步 [`src/pages/upload/photos.astro`](../src/pages/upload/photos.astro)
- 自然语言搜索页 [`src/pages/search.astro`](../src/pages/search.astro)

这个项目证明了:**纯前端 + 用户自带 Key + 一个好用的多模态模型**,就足以做出体验远超传统静态站的产品。没有后端、没有数据库代码、没有运维,但能力上接近一个完整 SaaS。

step-3.7-flash 在这里就是**整个产品的认知中枢**。它的速度(`reasoning_effort: 'minimal'` 下 2~4s)+ 结构化输出(`response_format`)+ 视觉理解,刚好覆盖了一个内容平台需要的所有 AI 能力。

祝你做出更好玩的东西。
