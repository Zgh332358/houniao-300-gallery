-- ============================================================================
-- 0006_shows.sql
-- 新增「动态展示」表 —— owner 从自己已发布的图里选 N 张,绑一个 layout
-- (coverflow/cards/snap),拿到一个独立可分享的 /<hash8>/<slug>/show/<id>/
-- 全屏沉浸式展示页。一个画廊允许多个 show 并存。
--
-- 强度边界:跟 photos 一致的"荣誉系统" —— anon 都能 INSERT/DELETE,
-- ownership 判定在客户端(owner_hash 匹配 session.phone 算出来的完整 hash)。
--
-- ⚠️ 由人工到 Supabase 控制台 SQL Editor 执行。
-- ⚠️ IF NOT EXISTS / DROP IF EXISTS,可重复执行。
-- ============================================================================

create table if not exists public.shows (
  id          uuid primary key default gen_random_uuid(),
  -- 完整 64 字符 SHA-256,跟 photos.owner_hash 对齐
  owner_hash  text not null,
  -- 冗余字段,跳过 join 直接按 artist 查
  artist_slug text not null,
  title       text not null default '',
  layout      text not null check (layout in ('coverflow','cards','snap')),
  -- photos.id 数组,数组顺序 = 展示先后顺序
  photo_ids   uuid[] not null default array[]::uuid[],
  created_at  timestamptz not null default now()
);

create index if not exists shows_owner_slug_idx on public.shows(owner_hash, artist_slug);
create index if not exists shows_created_idx on public.shows(created_at desc);

-- ----------------------------------------------------------------------------
-- RLS:跟 photos 同强度。anon 都能 SELECT / INSERT / DELETE。
-- ----------------------------------------------------------------------------
alter table public.shows enable row level security;

drop policy if exists "anyone can select shows" on public.shows;
create policy "anyone can select shows"
  on public.shows for select
  to anon, authenticated
  using (true);

drop policy if exists "anyone can insert shows" on public.shows;
create policy "anyone can insert shows"
  on public.shows for insert
  to anon, authenticated
  with check (true);

drop policy if exists "anyone can delete shows" on public.shows;
create policy "anyone can delete shows"
  on public.shows for delete
  to anon, authenticated
  using (true);

grant select, insert, delete on public.shows to anon, authenticated;
