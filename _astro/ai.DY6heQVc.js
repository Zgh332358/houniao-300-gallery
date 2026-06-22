const O="https://api.stepfun.com/step_plan/v1",d="step-3.7-flash",h="pf:step-key:v1",y="pf:step-model:v1";function w(){let a="",t=d;return typeof localStorage<"u"&&(a=localStorage.getItem(h)||"",t=localStorage.getItem(y)||d),{apiKey:a,model:t}}function N(a){typeof localStorage>"u"||(a.apiKey!==void 0&&localStorage.setItem(h,a.apiKey.trim()),a.model!==void 0&&localStorage.setItem(y,a.model.trim()||d))}function $(){return w().apiKey.trim().length>0}const E=`你是「候鸟 300」艺术家驻地的策展助理，同时负责作品发布前的内容安全审核。
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
后续轮次艺术家会给出「当前文案」与修改要求，请据此更新相应字段、保持中英两版一致，并在 reply 说明改动。`;function S(a,t=1024,i=.85){return new Promise((o,r)=>{const s=URL.createObjectURL(a),e=new Image;e.onload=()=>{URL.revokeObjectURL(s);const n=Math.min(1,t/Math.max(e.naturalWidth,e.naturalHeight)),m=Math.max(1,Math.round(e.naturalWidth*n)),l=Math.max(1,Math.round(e.naturalHeight*n)),u=document.createElement("canvas");u.width=m,u.height=l;const f=u.getContext("2d");if(!f)return r(new Error("canvas 不可用"));f.drawImage(e,0,0,m,l),o(u.toDataURL("image/jpeg",i))},e.onerror=()=>{URL.revokeObjectURL(s),r(new Error("无法解析图片"))},e.src=s})}async function p(a){const{apiKey:t,model:i}=w();if(!t)throw new Error("未填写 API Key");const o=await fetch(`${O}/chat/completions`,{method:"POST",headers:{Authorization:`Bearer ${t}`,"Content-Type":"application/json"},body:JSON.stringify({model:i||d,messages:a,temperature:.7,reasoning_effort:"minimal"})});if(!o.ok){let e=`HTTP ${o.status}`;try{const n=await o.json();e=n?.error?.message||n?.message||e}catch{}throw o.status===401&&(e="API Key 无效或已过期"),new Error(e)}const r=await o.json(),s=r.choices?.[0]?.message??{};return{content:c(s.content),reasoning:c(s.reasoning_content||s.reasoning),usage:r.usage??null}}function c(a){return typeof a=="string"?a.trim():""}function k(a){let t=(a||"").trim();const i=t.match(/```(?:json)?\s*([\s\S]*?)```/i);if(i&&(t=i[1].trim()),!t.startsWith("{")){const e=t.indexOf("{"),n=t.lastIndexOf("}");e!==-1&&n!==-1&&(t=t.slice(e,n+1))}let o={};try{o=JSON.parse(t)}catch{o={}}const r=o.tags&&typeof o.tags=="object"?o.tags:{},s=o.moderation&&typeof o.moderation=="object"?o.moderation:{};return{reply:c(o.reply),moderation:{safe:s.safe!==!1,reason:c(s.reason),categories:Array.isArray(s.categories)?s.categories.map(c).filter(Boolean):[]},suggestion:{title:c(o.title),titleEn:c(o.title_en),description:c(o.description),descriptionEn:c(o.description_en),tags:{theme:c(r.theme),style:c(r.style),medium:c(r.medium),palette:c(r.palette),mood:c(r.mood)},curatorNote:c(o.curatorNote)}}}async function M(a,t={}){const i=performance.now();let o;try{o=await S(a)}catch(n){return{ok:!1,error:n.message}}const r=[];t.userTitle?.trim()&&r.push(`艺术家自己写的标题：${t.userTitle.trim()}`),t.userDescription?.trim()&&r.push(`艺术家自己写的描述：${t.userDescription.trim()}`);const s=r.length?`这是我的作品。我已经写了一版文案如下:
${r.join(`
`)}
请先做内容审核;然后基于这张图给一版你自己的标题/描述/标签/策展短评 —— 作为建议供我参考,不要直接覆盖我的。中文/英文/标签都按 system 约定输出。`:"这是我的作品。我还没写任何文案,请先做内容审核,再生成一版完整的标题/描述/标签/策展短评。",e=[{role:"system",content:E},{role:"user",content:[{type:"text",text:s},{type:"image_url",image_url:{url:o}}]}];try{const{content:n,reasoning:m,usage:l}=await p(e),u=k(n);return e.push({role:"assistant",content:n}),{ok:!0,suggestion:u.suggestion,moderation:u.moderation,reply:u.reply,reasoning:m,usage:l,ms:Math.round(performance.now()-i),history:e}}catch(n){return{ok:!1,error:n.message}}}async function A(a,t,i){const o=`当前文案 —— 中文标题:《${i.title}》｜英文标题:${i.titleEn||"(空)"}｜中文描述:${i.description}｜英文描述:${i.descriptionEn||"(空)"}｜评语:${i.curatorNote}｜标签:${Object.values(i.tags).filter(Boolean).join("、")}
我的修改要求:${t}`,r=[...a,{role:"user",content:o}];try{const{content:s,reasoning:e}=await p(r),n=k(s);return r.push({role:"assistant",content:s}),{ok:!0,reply:n.reply||"已为你更新文案。",suggestion:n.suggestion,moderation:n.moderation,reasoning:e,history:r}}catch(s){return{ok:!1,error:s.message}}}const _=`你正在为一位艺术家的画作配语音导览解说词。
要求：
- 1~3 句话，加起来不超过 80 字
- 像策展人在艺术家身边轻声讲解，亲切但不啰嗦
- 描述画面里的关键观察 + 一点点情绪/解读，避免堆砌形容词
- 不要"这幅画"、"在这件作品中"这类废话开头
- 不要 Markdown、不要列表、不要引号、不要署名
- 输出纯文本即可，不要 JSON、不要前后缀`;async function j(a,t={}){const i=performance.now();try{const o=await S(a),r=[];if(t.title&&r.push(`标题：${t.title}`),t.description&&r.push(`描述：${t.description}`),t.curatorNote&&r.push(`策展短评：${t.curatorNote}`),t.tags){const l=t.tags,u=[l.theme,l.style,l.medium,l.palette,l.mood].filter(Boolean);u.length&&r.push(`标签：${u.join(" / ")}`)}const s=r.length?`请基于这张作品和以下已有元数据，生成解说词：
${r.join(`
`)}`:"请基于这张作品生成解说词。",e=[{role:"system",content:_},{role:"user",content:[{type:"image_url",image_url:{url:o}},{type:"text",text:s}]}],{content:n}=await p(e),m=(n||"").trim().replace(/^["「『]+|["」』]+$/g,"");return m?{ok:!0,text:m,ms:Math.round(performance.now()-i)}:{ok:!1,error:"模型没有返回解说词"}}catch(o){return{ok:!1,error:o.message}}}const T=`你是一个艺术作品检索引擎。
我会给你:
  - 一段访客的查询(自然语言,中英都可能)
  - 一个作品清单(JSON 数组,每个元素含 id / title / titleEn / description /
    descriptionEn / curatorNote / tags 五维)

你的任务:从清单里挑出最相关的作品(最多 9 件),按相关度从高到低排。
输出**仅一行 JSON**,结构: {"ids": ["id1","id2",...]}
- 不要 Markdown 代码块、不要任何解释、不要其它字段
- 没有相关结果就返回 {"ids": []}
- 不允许编造不在清单里的 id`;async function L(a,t){const i=performance.now();if(!a.trim())return{ok:!0,ids:[],ms:0};if(t.length===0)return{ok:!0,ids:[],ms:0};try{const o=[{role:"system",content:T},{role:"user",content:`查询: ${a.trim()}

作品清单(共 ${t.length} 件):
`+JSON.stringify(t)}],{content:r}=await p(o);let s=(r||"").trim();const e=s.match(/```(?:json)?\s*([\s\S]*?)```/i);if(e&&(s=e[1].trim()),!s.startsWith("{")){const f=s.indexOf("{"),g=s.lastIndexOf("}");f!==-1&&g!==-1&&(s=s.slice(f,g+1))}let n={};try{n=JSON.parse(s)}catch{return{ok:!1,error:"模型返回不是合法 JSON"}}const m=Array.isArray(n.ids)?n.ids.filter(f=>typeof f=="string").slice(0,9):[],l=new Set(t.map(f=>f.id));return{ok:!0,ids:m.filter(f=>l.has(f)),ms:Math.round(performance.now()-i)}}catch(o){return{ok:!1,error:o.message}}}function R(a,t,i=9){const o=a.trim().toLowerCase();if(!o)return[];const r=o.split(/[\s,，、；;]+/).map(e=>e.trim()).filter(e=>e.length>=1);return r.length?t.map(e=>{const n=[e.title,e.titleEn,e.description,e.descriptionEn,e.curatorNote,e.tags?.theme,e.tags?.style,e.tags?.medium,e.tags?.palette,e.tags?.mood].filter(Boolean).join(" ").toLowerCase();let m=0;for(const l of r)n.includes(l)&&(m+=1);return{id:e.id,score:m}}).filter(e=>e.score>0).sort((e,n)=>n.score-e.score).slice(0,i).map(e=>e.id):[]}export{d as D,M as a,N as b,A as c,w as d,j as g,$ as h,R as k,L as s};
