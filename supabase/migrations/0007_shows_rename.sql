-- ============================================================================
-- 0007_shows_rename.sql
-- 给 shows 表加 UPDATE 权限,但只允许改 title 一列。
--
-- 之前 0006 只放了 SELECT / INSERT / DELETE,所以画廊编辑模式下没法
-- 改 show 标题。改 title 是常见操作(笔误改字、换标题),不让 anon
-- 动 photo_ids / layout / owner_hash —— 那些属于"重做一个 show"语义。
--
-- 实现:加 UPDATE policy + 列级 grant(只 title)。
-- ⚠️ 由人工到 Supabase 控制台 SQL Editor 执行。可重复。
-- ============================================================================

drop policy if exists shows_anon_update on public.shows;

create policy shows_anon_update
  on public.shows for update
  to anon, authenticated
  using (true)
  with check (true);

-- 把整表 UPDATE 权限收回,再只 grant title 一列 —— 这样即便上面 policy 放行
-- UPDATE,PostgreSQL 在列权限层也会挡住对其他列的写入。
revoke update on public.shows from anon, authenticated;
grant update (title) on public.shows to anon, authenticated;
