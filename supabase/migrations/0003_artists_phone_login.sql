-- ============================================================================
-- 0003_artists_phone_login.sql
-- 简单手机登录(荣誉系统):给 artists 加 phone_hash 列 + 公开查询视图
--
-- 设计:
--   - 客户端在浏览器里 SHA-256(phone + 'houniao300-2026') 后再发到 DB,
--     DB 里**不存明文手机号**,只存 hash。
--   - 强度仅限"荣誉系统":+86 + 11 位数字暴力枚举可行,但比 dump 明文表难。
--   - artists_login_lookup 视图只暴露 (slug, name, phone_hash) —— 不带 contact /
--     bio / created_at,把 PII 表面再缩一截。
--
-- ⚠️ 由人工到 Supabase 控制台 SQL Editor 执行。
-- ⚠️ 全部使用 IF NOT EXISTS,可重复执行。
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. artists 加 phone_hash 列(可空,带部分 unique 索引)
--    部分索引是因为多数 demo seed 行的 phone_hash 是 NULL,不该撞 unique。
-- ----------------------------------------------------------------------------
alter table public.artists
  add column if not exists phone_hash text;

create unique index if not exists artists_phone_hash_uniq
  on public.artists(phone_hash)
  where phone_hash is not null;

-- ----------------------------------------------------------------------------
-- 2. 登录查询视图: hash → (slug, name)
--    访客匿名能 SELECT 这个视图(grant 给 anon),拿不到 contact 等敏感列。
--    artists 表本身没 SELECT policy,匿名直接 SELECT artists 仍然查空。
-- ----------------------------------------------------------------------------
create or replace view public.artists_login_lookup as
  select slug, name, phone_hash
  from public.artists
  where phone_hash is not null;

grant select on public.artists_login_lookup to anon, authenticated;
