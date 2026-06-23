-- ============================================================================
-- 0004_photos_delete_policy.sql
-- 给 photos 表 + photos storage bucket 加 anon DELETE 权限
--
-- 设计:荣誉系统下,artist 在自己的 /<slug>/ 页面能看到 × 按钮删自己的图。
-- 服务端 RLS 不知道"哪个手机号 = 哪个 slug",所以策略是"放 anon DELETE,
-- 客户端检查 ownership"。跟现状一致(anon INSERT 也是不检查的)。
--
-- ⚠️ 由人工到 Supabase 控制台 SQL Editor 执行。
-- ⚠️ DROP IF EXISTS,可重复执行。
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. photos 表:放 anon DELETE
-- ----------------------------------------------------------------------------
drop policy if exists "anyone can delete photos" on public.photos;
create policy "anyone can delete photos"
  on public.photos for delete
  to anon, authenticated
  using (true);

grant delete on public.photos to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. photos storage bucket:放 anon DELETE,这样删 DB 行的同时
--    能顺手把 JPEG 文件也清掉,不留孤儿对象。
-- ----------------------------------------------------------------------------
drop policy if exists "anyone can delete photo objects" on storage.objects;
create policy "anyone can delete photo objects"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'photos');
