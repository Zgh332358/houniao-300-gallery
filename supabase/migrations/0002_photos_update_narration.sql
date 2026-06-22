-- ============================================================================
-- 0002_photos_update_narration.sql
-- 修复:发布最后一步 setNarration 的 UPDATE 被 RLS 静默拒绝
--
-- 背景:0001 给 photos 加了 narration_text / narration_path 两列,但没给
-- photos 表加 UPDATE policy。photos 启用了 RLS 且只有 INSERT policy,所以
-- anon 调 PATCH photos 时 PostgREST 返回 200 + 0 行受影响,supabase-js
-- 不抛错,发布页就一路绿 ✓ 但 DB 里 narration_path 始终是空字符串。
-- 现象:访客点图无声,因为 narrationUrl() 看到空 path 直接返回 ''。
--
-- ⚠️ 由人工到 Supabase 控制台 SQL Editor 执行。
-- ⚠️ 全部使用 DROP IF EXISTS,可重复执行。
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. 放行 photos 表的 UPDATE,但靠下面的列级 grant 把可写范围卡死在解说两列
-- ----------------------------------------------------------------------------
drop policy if exists "anyone can update photos narration" on public.photos;
create policy "anyone can update photos narration"
  on public.photos for update
  to anon, authenticated
  using (true)
  with check (true);

-- ----------------------------------------------------------------------------
-- 2. 列级 grant:anon / authenticated 只能写 narration_text 与 narration_path
--    其余列(artist_contact、storage_path、title 等)即便 policy 允许 UPDATE
--    也写不进去 —— PostgreSQL 在 RLS 之外还会强制列级 GRANT。
-- ----------------------------------------------------------------------------
revoke update on public.photos from anon, authenticated;
grant update (narration_text, narration_path) on public.photos to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. 回填:把已经上传到 audio bucket 但 narration_path 还空着的行补上
--    路径规则与 photos.ts:uploadNarrationMp3 一致:narrations/<slug>/<id>.mp3
--    这一段只影响 narration_path 为 NULL 或空字符串的行,反复跑无副作用。
--    narration_text 没本地原文存档,只能下次发布时重新生成,这里不动。
-- ----------------------------------------------------------------------------
update public.photos
   set narration_path = 'narrations/' || artist_slug || '/' || id || '.mp3'
 where coalesce(narration_path, '') = '';
