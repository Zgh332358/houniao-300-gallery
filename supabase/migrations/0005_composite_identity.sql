-- ============================================================================
-- 0005_composite_identity.sql
-- URL 改 /<phoneHash8>/<slug>/ 复合身份 + 真正的所有权字段
--
-- 之前 photos 只用 artist_slug 字段记录归属,客户端篡改 localStorage
-- 就能冒充任意 slug 发图。本迁移改成:
--   - artists 取消 slug 单列 PK,允许同 slug 不同 phone 共存
--   - photos 加 owner_hash 列(完整 SHA-256)记录"谁发的"
--   - 既有 demo seed 4 行用虚拟 US 号回填
--
-- ⚠️ 由人工到 Supabase 控制台 SQL Editor 执行。
-- ⚠️ DROP IF EXISTS / IF NOT EXISTS,可重复执行。
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. artists 改 PK:slug 不再唯一,新加 id uuid PK
-- ----------------------------------------------------------------------------
alter table public.artists drop constraint if exists artists_pkey;
alter table public.artists add column if not exists id uuid default gen_random_uuid();
update public.artists set id = gen_random_uuid() where id is null;
alter table public.artists alter column id set not null;
alter table public.artists add constraint artists_pkey primary key (id);

-- ----------------------------------------------------------------------------
-- 2. (phone_hash, slug) 联合唯一 —— 同一手机号不能注册两个同 slug,
--    但不同手机号可以都用 "given"
-- ----------------------------------------------------------------------------
create unique index if not exists artists_phone_slug_uniq
  on public.artists(phone_hash, slug)
  where phone_hash is not null;

-- 0003 加过的 phone_hash 单列 unique 索引保留(1 phone : 1 slug)

-- ----------------------------------------------------------------------------
-- 3. photos 加 owner_hash 列(完整 64 字符 SHA-256,跟 artists.phone_hash 对齐)
-- ----------------------------------------------------------------------------
alter table public.photos add column if not exists owner_hash text;
create index if not exists photos_owner_hash_idx on public.photos(owner_hash);

-- ----------------------------------------------------------------------------
-- 4. 回填 demo seed 数据(虚拟 US 号 15555550101~04 的 SHA-256)
--    Hash 由 normalizePhone(phone) + 'houniao300-2026' 算 SHA-256 而来,
--    跟 src/lib/auth.ts:phoneHash 函数计算口径一致。
-- ----------------------------------------------------------------------------
-- 15555550101 (Lin Mo)
update public.artists
   set phone_hash = 'eb21c1f4c9f37a974bfcf6437faf858ae4b931267335e261e53147b543e06954'
 where slug = 'lin-mo' and phone_hash is null;
update public.photos
   set owner_hash = 'eb21c1f4c9f37a974bfcf6437faf858ae4b931267335e261e53147b543e06954'
 where artist_slug = 'lin-mo' and owner_hash is null;

-- 15555550102 (Aiken)
update public.artists
   set phone_hash = '55fee274d19ce49781c8d66de87ce10967dae892ed9a1dc5993623a9b394a298'
 where slug = 'aiken' and phone_hash is null;
update public.photos
   set owner_hash = '55fee274d19ce49781c8d66de87ce10967dae892ed9a1dc5993623a9b394a298'
 where artist_slug = 'aiken' and owner_hash is null;

-- 15555550103 (Mira Chen)
update public.artists
   set phone_hash = 'bcc642829048b2c89f4de1bbfd596700693693a05def7cfd6ead7ccf70af8bac'
 where slug = 'mira-chen' and phone_hash is null;
update public.photos
   set owner_hash = 'bcc642829048b2c89f4de1bbfd596700693693a05def7cfd6ead7ccf70af8bac'
 where artist_slug = 'mira-chen' and owner_hash is null;

-- 15555550104 (Yuki Sato)
update public.artists
   set phone_hash = 'a9d3691bc59771833c4b4afb4837ac0ca9208f132f0c1efbb9d6c1133416317d'
 where slug = 'yuki-sato' and phone_hash is null;
update public.photos
   set owner_hash = 'a9d3691bc59771833c4b4afb4837ac0ca9208f132f0c1efbb9d6c1133416317d'
 where artist_slug = 'yuki-sato' and owner_hash is null;

-- given 这种由用户自己注册的行,phone_hash 已经在注册时写入。
-- 但他们的 photos 行可能没 owner_hash —— 用 artists 表 join 回填。
update public.photos p
   set owner_hash = a.phone_hash
  from public.artists a
 where p.owner_hash is null
   and a.slug = p.artist_slug
   and a.phone_hash is not null;
