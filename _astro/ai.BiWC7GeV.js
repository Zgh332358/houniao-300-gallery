const k="https://api.stepfun.com/step_plan/v1",f="step-3.7-flash",h="pf:step-key:v1",y="pf:step-model:v1";function w(){let n="",o=f;return typeof localStorage<"u"&&(n=localStorage.getItem(h)||"",o=localStorage.getItem(y)||f),{apiKey:n,model:o}}function T(n){typeof localStorage>"u"||(n.apiKey!==void 0&&localStorage.setItem(h,n.apiKey.trim()),n.model!==void 0&&localStorage.setItem(y,n.model.trim()||f))}function A(){return w().apiKey.trim().length>0}const E=`你是「候鸟 300」艺术家驻地的策展助理，同时负责作品发布前的内容安全审核。
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
后续轮次艺术家会给出「当前文案」与修改要求，请据此更新相应字段、保持中英两版一致，并在 reply 说明改动。`;function O(n,o=1024,i=.85){return new Promise((t,a)=>{const s=URL.createObjectURL(n),e=new Image;e.onload=()=>{URL.revokeObjectURL(s);const r=Math.min(1,o/Math.max(e.naturalWidth,e.naturalHeight)),m=Math.max(1,Math.round(e.naturalWidth*r)),d=Math.max(1,Math.round(e.naturalHeight*r)),u=document.createElement("canvas");u.width=m,u.height=d;const l=u.getContext("2d");if(!l)return a(new Error("canvas 不可用"));l.drawImage(e,0,0,m,d),t(u.toDataURL("image/jpeg",i))},e.onerror=()=>{URL.revokeObjectURL(s),a(new Error("无法解析图片"))},e.src=s})}async function g(n){const{apiKey:o,model:i}=w();if(!o)throw new Error("未填写 API Key");const t=await fetch(`${k}/chat/completions`,{method:"POST",headers:{Authorization:`Bearer ${o}`,"Content-Type":"application/json"},body:JSON.stringify({model:i||f,messages:n,temperature:.7,reasoning_effort:"minimal"})});if(!t.ok){let e=`HTTP ${t.status}`;try{const r=await t.json();e=r?.error?.message||r?.message||e}catch{}throw t.status===401&&(e="API Key 无效或已过期"),new Error(e)}const a=await t.json(),s=a.choices?.[0]?.message??{};return{content:c(s.content),reasoning:c(s.reasoning_content||s.reasoning),usage:a.usage??null}}function c(n){return typeof n=="string"?n.trim():""}function S(n){let o=(n||"").trim();const i=o.match(/```(?:json)?\s*([\s\S]*?)```/i);if(i&&(o=i[1].trim()),!o.startsWith("{")){const e=o.indexOf("{"),r=o.lastIndexOf("}");e!==-1&&r!==-1&&(o=o.slice(e,r+1))}let t={};try{t=JSON.parse(o)}catch{t={}}const a=t.tags&&typeof t.tags=="object"?t.tags:{},s=t.moderation&&typeof t.moderation=="object"?t.moderation:{};return{reply:c(t.reply),moderation:{safe:s.safe!==!1,reason:c(s.reason),categories:Array.isArray(s.categories)?s.categories.map(c).filter(Boolean):[]},suggestion:{title:c(t.title),titleEn:c(t.title_en),description:c(t.description),descriptionEn:c(t.description_en),tags:{theme:c(a.theme),style:c(a.style),medium:c(a.medium),palette:c(a.palette),mood:c(a.mood)},curatorNote:c(t.curatorNote)}}}async function L(n,o={}){const i=performance.now();let t;try{t=await O(n)}catch(r){return{ok:!1,error:r.message}}const a=[];o.userTitle?.trim()&&a.push(`艺术家自己写的标题：${o.userTitle.trim()}`),o.userDescription?.trim()&&a.push(`艺术家自己写的描述：${o.userDescription.trim()}`);const s=a.length?`这是我的作品。我已经写了一版文案如下:
${a.join(`
`)}
请先做内容审核;然后基于这张图给一版你自己的标题/描述/标签/策展短评 —— 作为建议供我参考,不要直接覆盖我的。中文/英文/标签都按 system 约定输出。`:"这是我的作品。我还没写任何文案,请先做内容审核,再生成一版完整的标题/描述/标签/策展短评。",e=[{role:"system",content:E},{role:"user",content:[{type:"text",text:s},{type:"image_url",image_url:{url:t}}]}];try{const{content:r,reasoning:m,usage:d}=await g(e),u=S(r);return e.push({role:"assistant",content:r}),{ok:!0,suggestion:u.suggestion,moderation:u.moderation,reply:u.reply,reasoning:m,usage:d,ms:Math.round(performance.now()-i),history:e}}catch(r){return{ok:!1,error:r.message}}}async function M(n,o,i){const t=`当前文案 —— 中文标题:《${i.title}》｜英文标题:${i.titleEn||"(空)"}｜中文描述:${i.description}｜英文描述:${i.descriptionEn||"(空)"}｜评语:${i.curatorNote}｜标签:${Object.values(i.tags).filter(Boolean).join("、")}
我的修改要求:${o}`,a=[...n,{role:"user",content:t}];try{const{content:s,reasoning:e}=await g(a),r=S(s);return a.push({role:"assistant",content:s}),{ok:!0,reply:r.reply||"已为你更新文案。",suggestion:r.suggestion,moderation:r.moderation,reasoning:e,history:a}}catch(s){return{ok:!1,error:s.message}}}const _=`你是一个艺术作品检索引擎。
我会给你:
  - 一段访客的查询(自然语言,中英都可能)
  - 一个作品清单(JSON 数组,每个元素含 id / title / titleEn / description /
    descriptionEn / curatorNote / tags 五维)

你的任务:从清单里挑出最相关的作品(最多 9 件),按相关度从高到低排。
输出**仅一行 JSON**,结构: {"ids": ["id1","id2",...]}
- 不要 Markdown 代码块、不要任何解释、不要其它字段
- 没有相关结果就返回 {"ids": []}
- 不允许编造不在清单里的 id`;async function j(n,o){const i=performance.now();if(!n.trim())return{ok:!0,ids:[],ms:0};if(o.length===0)return{ok:!0,ids:[],ms:0};try{const t=[{role:"system",content:_},{role:"user",content:`查询: ${n.trim()}

作品清单(共 ${o.length} 件):
`+JSON.stringify(o)}],{content:a}=await g(t);let s=(a||"").trim();const e=s.match(/```(?:json)?\s*([\s\S]*?)```/i);if(e&&(s=e[1].trim()),!s.startsWith("{")){const l=s.indexOf("{"),p=s.lastIndexOf("}");l!==-1&&p!==-1&&(s=s.slice(l,p+1))}let r={};try{r=JSON.parse(s)}catch{return{ok:!1,error:"模型返回不是合法 JSON"}}const m=Array.isArray(r.ids)?r.ids.filter(l=>typeof l=="string").slice(0,9):[],d=new Set(o.map(l=>l.id));return{ok:!0,ids:m.filter(l=>d.has(l)),ms:Math.round(performance.now()-i)}}catch(t){return{ok:!1,error:t.message}}}function N(n,o,i=9){const t=n.trim().toLowerCase();if(!t)return[];const a=t.split(/[\s,，、；;]+/).map(e=>e.trim()).filter(e=>e.length>=1);return a.length?o.map(e=>{const r=[e.title,e.titleEn,e.description,e.descriptionEn,e.curatorNote,e.tags?.theme,e.tags?.style,e.tags?.medium,e.tags?.palette,e.tags?.mood].filter(Boolean).join(" ").toLowerCase();let m=0;for(const d of a)r.includes(d)&&(m+=1);return{id:e.id,score:m}}).filter(e=>e.score>0).sort((e,r)=>r.score-e.score).slice(0,i).map(e=>e.id):[]}export{f as D,T as a,L as b,M as c,w as g,A as h,N as k,j as s};
