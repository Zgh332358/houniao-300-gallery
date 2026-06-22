# supabase/migrations

数据库与 Storage 演化脚本。**Claude Code 不会自动执行**,所有 SQL 由人工到 Supabase 控制台手动跑。

## 怎么跑

1. 打开 [supabase.com](https://supabase.com) 你的项目 → 左侧 **SQL Editor** → **New query**
2. 按文件名编号顺序,把每个 `.sql` 全选粘贴 → **Run**
3. 看到「Success. No rows returned.」即可
4. 全部脚本都用 `IF NOT EXISTS` / `DROP POLICY IF EXISTS` 写法,可重复执行,中途中断可重跑

## 文件清单

| 文件 | 作用 | 何时跑 |
|---|---|---|
| `0001_artists_voice_artworks.sql` | 新增 `artists` 表(声音克隆 + contact 私有);`photos` 加双语/标签/解说/审核字段;`audio` bucket;RLS 把 contact 关进黑屋;公开视图 `artists_public` / `photos_public` 剥离 contact | 项目里程碑 B(声音克隆功能落地之前) |

## 重要约定

- **不要**直接在控制台改表结构。任何变更都先写一个新的 `.sql` 文件入仓,再执行。
- **不要**把 `service_role` key 放进任何前端代码。anon key 才是前端公开安全的。
- 如果迁移失败,先看错误是不是「already exists」类的幂等冲突;若是,可忽略;否则停下来报告。
