const _="https://api.stepfun.com/step_plan/v1",d="step-3.7-flash",p="pf:step-key:v1",y="pf:step-model:v1";function w(){let n="",s=d;return typeof localStorage<"u"&&(n=localStorage.getItem(p)||"",s=localStorage.getItem(y)||d),{apiKey:n,model:s}}function $(n){typeof localStorage>"u"||(n.apiKey!==void 0&&localStorage.setItem(p,n.apiKey.trim()),n.model!==void 0&&localStorage.setItem(y,n.model.trim()||d))}function T(){return w().apiKey.trim().length>0}const O=`你是「候鸟 300」艺术家驻地的策展助理，同时负责作品发布前的内容安全审核。
你将在多轮对话中，帮一位艺术家打磨 TA 上传的这张作品的展陈文案。

每一轮都必须、且只能输出一个 JSON 对象（不要 Markdown 代码块、不要任何多余文字），结构：
{
  "reply": "给艺术家看的一句话对话回复。首轮为简短开场；当 TA 要求修改时，说明你改了什么",
  "moderation": {
    "safe": true 或 false,
    "reason": "若 safe=false，用一句话说明判定原因；safe=true 时留空",
    "categories": ["命中的违规类别，安全则空数组"]
  },
  "title": "有意境、不超过 10 字的中文作品标题",
  "title_en": "对应的英文标题(精炼,不要逐字翻译,符合英语展陈语境;最长 8 个英文单词)",
  "description": "40 字以内、画册图注式的中文作品描述",
  "description_en": "对应的英文描述(同样画册图注式,不超过 30 个英文单词)",
  "tags": { "theme": "主题", "style": "风格", "medium": "媒介", "palette": "主色调", "mood": "情绪" },
  "curatorNote": "30 字以内、有审美判断的中文策展短评"
}

英文字段写作要求:title_en / description_en 不是中文逐字直译,要像英文展览图录的措辞 ——
简洁、画面优先、避免 "this work shows..." 之类废话起手。
tags 用中文(theme/style 等键值都用中文短语),curatorNote 仅中文。

审核标准（categories 用中文，可多选）：色情/露骨成人内容(成人)、赌博(赌博)、毒品/管制药物(毒品)、
严重暴力血腥(暴力)、其它违法内容(违法)、主体为广告推广/二维码/导流引流(广告)。
凡命中以上、属于不适合公开展览传播的内容，moderation.safe=false 并写明类别与原因；否则 safe=true。
无论安全与否，所有字段都照常生成。
后续轮次艺术家会给出「当前文案」与修改要求，请据此更新相应字段、保持中英两版一致，并在 reply 说明改动。`;function k(n,s=1024,a=.85){return new Promise((t,r)=>{const o=URL.createObjectURL(n),e=new Image;e.onload=()=>{URL.revokeObjectURL(o);const i=Math.min(1,s/Math.max(e.naturalWidth,e.naturalHeight)),u=Math.max(1,Math.round(e.naturalWidth*i)),l=Math.max(1,Math.round(e.naturalHeight*i)),m=document.createElement("canvas");m.width=u,m.height=l;const h=m.getContext("2d");if(!h)return r(new Error("canvas 不可用"));h.drawImage(e,0,0,u,l),t(m.toDataURL("image/jpeg",a))},e.onerror=()=>{URL.revokeObjectURL(o),r(new Error("无法解析图片"))},e.src=o})}async function g(n){const{apiKey:s,model:a}=w();if(!s)throw new Error("未填写 API Key");const t=await fetch(`${_}/chat/completions`,{method:"POST",headers:{Authorization:`Bearer ${s}`,"Content-Type":"application/json"},body:JSON.stringify({model:a||d,messages:n,temperature:.7,reasoning_effort:"minimal"})});if(!t.ok){let e=`HTTP ${t.status}`;try{const i=await t.json();e=i?.error?.message||i?.message||e}catch{}throw t.status===401&&(e="API Key 无效或已过期"),new Error(e)}const r=await t.json(),o=r.choices?.[0]?.message??{};return{content:c(o.content),reasoning:c(o.reasoning_content||o.reasoning),usage:r.usage??null}}function c(n){return typeof n=="string"?n.trim():""}function S(n){let s=(n||"").trim();const a=s.match(/```(?:json)?\s*([\s\S]*?)```/i);if(a&&(s=a[1].trim()),!s.startsWith("{")){const e=s.indexOf("{"),i=s.lastIndexOf("}");e!==-1&&i!==-1&&(s=s.slice(e,i+1))}let t={};try{t=JSON.parse(s)}catch{t={}}const r=t.tags&&typeof t.tags=="object"?t.tags:{},o=t.moderation&&typeof t.moderation=="object"?t.moderation:{};return{reply:c(t.reply),moderation:{safe:o.safe!==!1,reason:c(o.reason),categories:Array.isArray(o.categories)?o.categories.map(c).filter(Boolean):[]},suggestion:{title:c(t.title),titleEn:c(t.title_en),description:c(t.description),descriptionEn:c(t.description_en),tags:{theme:c(r.theme),style:c(r.style),medium:c(r.medium),palette:c(r.palette),mood:c(r.mood)},curatorNote:c(t.curatorNote)}}}async function j(n,s={}){const a=performance.now();let t;try{t=await k(n)}catch(i){return{ok:!1,error:i.message}}const r=[];s.userTitle?.trim()&&r.push(`艺术家自己写的标题：${s.userTitle.trim()}`),s.userDescription?.trim()&&r.push(`艺术家自己写的描述：${s.userDescription.trim()}`);const o=r.length?`这是我的作品。我已经写了一版文案如下:
${r.join(`
`)}
请先做内容审核;然后基于这张图给一版你自己的标题/描述/标签/策展短评 —— 作为建议供我参考,不要直接覆盖我的。中文/英文/标签都按 system 约定输出。`:"这是我的作品。我还没写任何文案,请先做内容审核,再生成一版完整的标题/描述/标签/策展短评。",e=[{role:"system",content:O},{role:"user",content:[{type:"text",text:o},{type:"image_url",image_url:{url:t}}]}];try{const{content:i,reasoning:u,usage:l}=await g(e),m=S(i);return e.push({role:"assistant",content:i}),{ok:!0,suggestion:m.suggestion,moderation:m.moderation,reply:m.reply,reasoning:u,usage:l,ms:Math.round(performance.now()-a),history:e}}catch(i){return{ok:!1,error:i.message}}}async function A(n,s,a){const t=`当前文案 —— 中文标题:《${a.title}》｜英文标题:${a.titleEn||"(空)"}｜中文描述:${a.description}｜英文描述:${a.descriptionEn||"(空)"}｜评语:${a.curatorNote}｜标签:${Object.values(a.tags).filter(Boolean).join("、")}
我的修改要求:${s}`,r=[...n,{role:"user",content:t}];try{const{content:o,reasoning:e}=await g(r),i=S(o);return r.push({role:"assistant",content:o}),{ok:!0,reply:i.reply||"已为你更新文案。",suggestion:i.suggestion,moderation:i.moderation,reasoning:e,history:r}}catch(o){return{ok:!1,error:o.message}}}const E=`你是一个艺术作品检索引擎。
我会给你:
  - 一段访客的查询(自然语言,中英都可能)
  - 一个作品清单(JSON 数组,每个元素含 id / title / titleEn / description /
    descriptionEn / curatorNote / tags 五维)

你的任务:从清单里挑出最相关的作品(最多 9 件),按相关度从高到低排。
输出**仅一行 JSON**,结构: {"ids": ["id1","id2",...]}
- 不要 Markdown 代码块、不要任何解释、不要其它字段
- 没有相关结果就返回 {"ids": []}
- 不允许编造不在清单里的 id`;async function L(n,s){const a=performance.now();if(!n.trim())return{ok:!0,ids:[],ms:0};if(s.length===0)return{ok:!0,ids:[],ms:0};try{const t=[{role:"system",content:E},{role:"user",content:`查询: ${n.trim()}

作品清单(共 ${s.length} 件):
`+JSON.stringify(s)}],{content:r}=await g(t);let o=(r||"").trim();const e=o.match(/```(?:json)?\s*([\s\S]*?)```/i);if(e&&(o=e[1].trim()),!o.startsWith("{")){const h=o.indexOf("{"),f=o.lastIndexOf("}");h!==-1&&f!==-1&&(o=o.slice(h,f+1))}let i={};try{i=JSON.parse(o)}catch{return{ok:!1,error:"模型返回不是合法 JSON"}}const u=Array.isArray(i.ids)?i.ids.filter(h=>typeof h=="string").slice(0,9):[],l=new Set(s.map(h=>h.id));return{ok:!0,ids:u.filter(h=>l.has(h)),ms:Math.round(performance.now()-a)}}catch(t){return{ok:!1,error:t.message}}}function N(n,s,a=9){const t=n.trim().toLowerCase();if(!t)return[];const r=t.split(/[\s,，、；;]+/).map(e=>e.trim()).filter(e=>e.length>=1);return r.length?s.map(e=>{const i=[e.title,e.titleEn,e.description,e.descriptionEn,e.curatorNote,e.tags?.theme,e.tags?.style,e.tags?.medium,e.tags?.palette,e.tags?.mood].filter(Boolean).join(" ").toLowerCase();let u=0;for(const l of r)i.includes(l)&&(u+=1);return{id:e.id,score:u}}).filter(e=>e.score>0).sort((e,i)=>i.score-e.score).slice(0,a).map(e=>e.id):[]}const M=`你是「候鸟 300」摄影社区的社交媒体文案助手。
用户会选择一组摄影作品（1~9 张），你根据图片的视觉内容、情绪、主题，生成适合发布在微信朋友圈和小红书的文案。

每一轮都必须、且只能输出一个 JSON 对象（不要 Markdown 代码块、不要任何多余文字），结构：
{
  "reply": "给用户的一句话对话回复。首轮为简短开场；当用户要求修改时，说明你改了什么",
  "wechat": "适合微信朋友圈的文案。简洁有意境，1~3 句话，可以包含 emoji，字数不超过 100",
  "xiaohongshu_title": "小红书标题。带 emoji、吸引眼球、不超过 20 字",
  "xiaohongshu_body": "小红书正文。200 字以内，包含对图片的描述、情绪渲染、拍摄心得等，自然流畅，适合小红书调性",
  "xiaohongshu_tags": ["#话题标签1", "#话题标签2", "#话题标签3"]
}

写作要求：
- 朋友圈文案要克制含蓄，像一个有审美的摄影师发的，不要网红腔
- 小红书文案可以稍活泼，但要有摄影圈的专业感，不要过于浮夸
- 标签 5~8 个，包含摄影相关 + 情绪/场景相关的混搭
- 如果多张图有共同主题就围绕主题写；如果风格各异就找一个串联它们的切入角度
- 后续轮次用户会给修改要求，请据此更新文案并在 reply 说明改动`;function x(n){let s=(n||"").trim();const a=s.match(/```(?:json)?\s*([\s\S]*?)```/i);if(a&&(s=a[1].trim()),!s.startsWith("{")){const r=s.indexOf("{"),o=s.lastIndexOf("}");r!==-1&&o!==-1&&(s=s.slice(r,o+1))}let t={};try{t=JSON.parse(s)}catch{t={}}return{reply:c(t.reply),copy:{wechat:c(t.wechat),xiaohongshu:{title:c(t.xiaohongshu_title),body:c(t.xiaohongshu_body),tags:Array.isArray(t.xiaohongshu_tags)?t.xiaohongshu_tags.map(c).filter(Boolean):[]}}}}async function v(n){if(n.length===0)return{ok:!1,error:"请至少选择一张图片"};const s=n.map(t=>({type:"image_url",image_url:{url:t}})),a=[{role:"system",content:M},{role:"user",content:[{type:"text",text:`这是我选的 ${n.length} 张摄影作品，请帮我生成朋友圈和小红书文案。`},...s]}];try{const{content:t}=await g(a),r=x(t);return a.push({role:"assistant",content:t}),{ok:!0,copy:r.copy,reply:r.reply,history:a}}catch(t){return{ok:!1,error:t.message}}}async function P(n,s,a){const t=`当前文案 —— 朋友圈:${a.wechat}｜小红书标题:${a.xiaohongshu.title}｜小红书正文:${a.xiaohongshu.body}｜标签:${a.xiaohongshu.tags.join(" ")}
我的修改要求:${s}`,r=[...n,{role:"user",content:t}];try{const{content:o}=await g(r),e=x(o);return r.push({role:"assistant",content:o}),{ok:!0,copy:e.copy,reply:e.reply||"已更新文案。",history:r}}catch(o){return{ok:!1,error:o.message}}}function I(n,s=1024,a=.85){return new Promise((t,r)=>{const o=new Image;o.crossOrigin="anonymous",o.onload=()=>{const e=Math.min(1,s/Math.max(o.naturalWidth,o.naturalHeight)),i=Math.max(1,Math.round(o.naturalWidth*e)),u=Math.max(1,Math.round(o.naturalHeight*e)),l=document.createElement("canvas");l.width=i,l.height=u;const m=l.getContext("2d");if(!m)return r(new Error("canvas 不可用"));m.drawImage(o,0,0,i,u),t(l.toDataURL("image/jpeg",a))},o.onerror=()=>r(new Error("无法加载图片")),o.src=n})}export{d as D,v as a,L as b,A as c,j as d,w as g,T as h,N as k,P as r,$ as s,I as u};
