-- ============================================================================
-- 0001_artists_voice_artworks.sql
-- 演化项目里程碑 B: 引入 artists 表 + 声音克隆字段 + 双语/AI 字段 + audio bucket
--
-- ⚠️ 由人工到 Supabase 控制台 SQL Editor 执行。Claude Code 不直连线上库。
-- ⚠️ 全部使用 IF NOT EXISTS / DROP POLICY IF EXISTS,可重复执行。
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. artists 表: 每位艺术家一行,承载敏感字段(contact)与音色信息
-- ----------------------------------------------------------------------------
create table if not exists public.artists (
  slug                text primary key,
  name                text not null,
  bio                 text default '',
  -- 联系方式: 私有,绝不通过任何匿名可读路径暴露
  contact             text default '',
  -- StepFun 音色复刻 ID(POST /v1/audio/voices 返回的 id)
  voice_id            text,
  -- 音色样本在 audio bucket 的路径(<slug>/voice-sample.<ext>)
  voice_sample_path   text,
  -- 声音克隆授权时间。NULL 表示未授权,不得克隆
  consent_at          timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists artists_created_at_idx on public.artists(created_at desc);

-- ----------------------------------------------------------------------------
-- 2. 给 photos 表加 AI 与解说字段(渐进式,不重建表)
--    photos 现有列保留: id, artist_slug, artist_name, artist_contact,
--      collection_slug, collection_name, title, description, storage_path,
--      width, height, format, created_at
--    artist_contact 保留为写入路径(运营私下回联),但不进任何匿名可读路径,
--      靠下面的 RLS 列限制 + 应用层显式 SELECT 列控制
-- ----------------------------------------------------------------------------
alter table public.photos
  add column if not exists title_en        text default '',
  add column if not exists description_en  text default '',
  add column if not exists tags            jsonb default '{}'::jsonb,
  add column if not exists curator_note    text default '',
  add column if not exists narration_text  text default '',
  add column if not exists narration_path  text default '',
  add column if not exists moderation      jsonb default '{}'::jsonb;

create index if not exists photos_tags_gin_idx on public.photos using gin (tags);

-- ----------------------------------------------------------------------------
-- 3. audio bucket: 公开读,匿名插入(用于解说 mp3 + 音色样本)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('audio', 'audio', true)
on conflict (id) do update set public = true;

-- audio bucket 上传策略
drop policy if exists "anyone can upload audio" on storage.objects;
create policy "anyone can upload audio"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'audio');

drop policy if exists "anyone can read audio" on storage.objects;
create policy "anyone can read audio"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'audio');

-- ----------------------------------------------------------------------------
-- 4. artists 表 RLS
--    匿名只能 INSERT(用户首次填写自己的艺术家档案) +
--    从公开视图(无 contact)读取。直接 SELECT artists 表是被拒绝的,
--    contact 列因此对匿名永远不可见。
-- ----------------------------------------------------------------------------
alter table public.artists enable row level security;

drop policy if exists "anyone can insert artists" on public.artists;
create policy "anyone can insert artists"
  on public.artists for insert
  to anon, authenticated
  with check (true);

-- 允许匿名 UPDATE 自己档案的 voice/consent 字段(简化方案,无登录态)
-- 生产环境如果接入登录,建议改成 auth.uid() 限定;当前驻地场景接受这个权衡。
drop policy if exists "anyone can update artists" on public.artists;
create policy "anyone can update artists"
  on public.artists for update
  to anon, authenticated
  using (true)
  with check (true);

-- ⚠️ 故意不建 SELECT policy: 匿名直接 SELECT artists 会被 RLS 拒,
--    contact 列从此不可能通过 PostgREST 泄露。
--    访客读取走下方 artists_public 视图。

-- ----------------------------------------------------------------------------
-- 5. 公开视图: artists_public 剥离 contact,供前端访客侧消费
-- ----------------------------------------------------------------------------
create or replace view public.artists_public as
  select slug, name, bio, voice_id, voice_sample_path, consent_at, created_at
  from public.artists;

-- 视图上的权限授给匿名(视图不继承底表 RLS,需要显式 grant)
grant select on public.artists_public to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6. photos 表的列级保护: 通过显式视图 photos_public 把 artist_contact 排除
--    应用层的 listAll() 已经显式列举 SELECT 列绕开了,但视图作为兜底。
-- ----------------------------------------------------------------------------
create or replace view public.photos_public as
  select id, artist_slug, artist_name,
         collection_slug, collection_name,
         title, title_en, description, description_en,
         tags, curator_note, narration_text, narration_path, moderation,
         storage_path, width, height, format, created_at
  from public.photos;

grant select on public.photos_public to anon, authenticated;
