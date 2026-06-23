-- ============================================================================
-- 0008_shows_cascade_photo_delete.sql
-- photos DELETE 时,自动从 shows.photo_ids 数组里抹掉那张图;
-- 如果某个 show 因此变空(photo_ids 没了元素),整个 show 行也删。
--
-- 之前画廊编辑模式删图,shows.photo_ids 不变,展示页就出现"找不到这张图"
-- 的空槽位(或者全空展示)。这条 trigger 在服务端把级联做掉,从任何
-- 客户端(前端 UI / SQL Editor / 别的 app)删图都会生效。
--
-- 用 SECURITY DEFINER 让 trigger 以 owner 权限跑,绕过 anon 对 shows
-- UPDATE 只能改 title 列的限制(0007 加的列级 grant)。
--
-- ⚠️ 由人工到 Supabase 控制台 SQL Editor 执行。可重复。
-- ============================================================================

create or replace function public.shows_cascade_photo_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 从所有 shows 的 photo_ids 数组里去掉被删的这张图 id
  update public.shows
     set photo_ids = array_remove(photo_ids, OLD.id)
   where OLD.id = any(photo_ids);

  -- 空数组的 show(photo_ids 长度变 NULL = 空)直接删行
  delete from public.shows
   where array_length(photo_ids, 1) is null;

  return OLD;
end;
$$;

drop trigger if exists shows_cascade_photo_delete_trg on public.photos;

create trigger shows_cascade_photo_delete_trg
  after delete on public.photos
  for each row
  execute function public.shows_cascade_photo_delete();
