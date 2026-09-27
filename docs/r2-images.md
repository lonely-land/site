# 图片资源迁移到 Cloudflare R2

站点的大图（`public/images` 下约 95MB，单张 13–18MB）不再随仓库分发，改为上传到
Cloudflare R2 桶 `lonelyland`，页面直接引用公开域 `https://land.c0ffee.space`。
仓库里只保留代码和小体积资源。

## Key 布局

| Key | 内容 | 生成方式 |
| --- | --- | --- |
| `images/original/<name>.<ext>` | 原始文件归档，`content-type` 按真实类型 | 原样上传，`<ext>` 取自 sharp 探测到的真实格式 |
| `images/full/<name>.webp` | 灯箱大图，最长边 3840，quality 85 | `lib/image-variants.mjs` |
| `images/thumb/<name>.webp` | 列表缩略图，宽 800，quality 75 | `lib/image-variants.mjs` |

- 公开 URL = `${R2_PUBLIC_BASE}/<key>`，例如
  `https://land.c0ffee.space/images/full/gallery-main.webp`。
- 变体统一走 `lib/image-variants.mjs`（投稿管线与迁移脚本共用），避免两套参数漂移。
  重新编码同时也起到消毒作用：公开域上只有干净的 webp。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `R2_ACCESS_KEY_ID` | R2 API Token 的 Access Key ID |
| `R2_SECRET_ACCESS_KEY` | R2 API Token 的 Secret |
| `R2_ENDPOINT` | `https://<accountid>.r2.cloudflarestorage.com` |
| `R2_BUCKET` | `lonelyland` |
| `R2_PUBLIC_BASE` | `https://land.c0ffee.space` |

**凭据只放环境变量**：不写进任何仓库文件、不放进命令行参数、不打印到日志。
本地调试可以放一个 `.env.r2.local`（`.gitignore` 里的 `.env*.local` 已经覆盖），例如：

```bash
# .env.r2.local（不要提交）
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
R2_BUCKET=lonelyland
R2_PUBLIC_BASE=https://land.c0ffee.space
```

## 本地使用

```bash
set -a; . .env.r2.local; set +a

# 0) 连通性自检：上传一个测试对象 -> 校验公开 URL -> 删除
node -e "import('./lib/r2.mjs').then(async (m) => {
  const c = m.r2ConfigFromEnv();
  const key = 'images/_healthcheck/test-' + Date.now() + '.txt';
  await m.putObject(key, Buffer.from('hello'), 'text/plain; charset=utf-8', c);
  console.log(m.publicUrl(key, c));
  console.log(await m.headObject(key, c));
  await m.deleteObject(key, c);
})"

# 1) 上传单个文件（上传后自动 HEAD 校验大小，打印公开 URL）
node scripts/r2-upload-file.mjs public/images/gallery-main.png \
  --key images/original/gallery-main.png

# 2) 迁移存量图片：默认 dry-run，只扫描 + 算变体 + 打印计划
node scripts/migrate-images-to-r2.mjs

# 3) 确认无误后真正上传（并把 settings.json 的 gallery 指向 R2）
node scripts/migrate-images-to-r2.mjs --apply

# 4) 上传成功并逐个 HEAD 校验通过后，删除本地源图
node scripts/migrate-images-to-r2.mjs --apply --delete-local
```

CLI 参数（`scripts/migrate-images-to-r2.mjs`）：

| 参数 | 作用 |
| --- | --- |
| （默认） | dry-run：不上传、不删除、不写文件 |
| `--apply` | 真正上传 |
| `--delete-local` | 每个 key 都 HEAD 校验通过后才删除本地源图（隐含 `--apply`） |
| `--sync` | CI 同步模式：`--apply` + 不写 `settings.json` + 绝不删除本地（幂等） |
| `--skip-settings` | 上传但不改 `settings.json` |
| `--force` | 远端同名对象大小一致时也重新上传 |
| `--dir <path>` | 源目录，默认 `<repo>/public/images` |
| `--settings <path>` | 设置文件，默认 `<repo>/settings.json` |

行为要点：

- 扫描 `public/images` 时跳过 `thumb/`、`full/` 以及 `_` 开头的目录（如 `_healthcheck/`）。
- `settings.json` 中 `gallery[].file` 是**纯文件名**的条目会被改写：
  `file` → `images/full/<name>.webp` 的公开 URL，`thumb` → `images/thumb/<name>.webp`，
  `full` → `images/full/<name>.webp`；已经是 `http(s)://` 外链或含路径的条目保持原样并打印跳过原因。
- `settings.json` 中 `friends[].image` 以 `/images/` 开头的本地图会被改写为
  `images/thumb/<name>.webp` 的公开 URL（卡片尺寸够用且省流量）；外链保持原样。
  否则 `--delete-local` 删掉本地文件后 Friends 卡片图会全部裂掉。
- 写回 `settings.json` 时保持 4 空格缩进 + 末尾换行。
- 单个源图变体生成失败（损坏/超大）只会记为该图失败并跳过它的 settings 改写，不会中断整批；
  但脚本最终会以非 0 退出。
- 幂等：远端已存在且大小一致的对象会跳过上传，可安全重复执行；`settings.json` 已是
  公开 URL 时会被识别为外链并跳过，不会重复改写。
- 失败即非 0 退出；有任一对象校验失败时，即使带 `--delete-local` 也不会删除本地源图。

## CI：GitHub Actions

工作流 `.github/workflows/upload-r2.yml`：

- 触发：push 到 `main` 且 `public/images/**` 有变化，或手动 `workflow_dispatch`。
- `permissions: contents: read`，不会 commit / push 任何东西。
- 并发组 `upload-r2-<ref>` 且 `cancel-in-progress: false`，避免并发上传互相覆盖。
- 需要的 repository secrets：`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_ENDPOINT`、
  `R2_BUCKET`、`R2_PUBLIC_BASE`（工作流只校验存在性并打印变量名，不打印取值）。
- 执行 `node scripts/migrate-images-to-r2.mjs --sync`：上传新图，已存在且大小一致的对象
  自动跳过；不修改仓库文件、不删除任何东西。

## 投稿管线（Issue → R2 → PR）

图片投稿不再往仓库提交二进制文件，全流程如下：

1. 用户用 Issue 表单提交（`.github/ISSUE_TEMPLATE/gallery-submission.yml`），
   直接粘贴图片或贴任意公开直链，一行一张；标题写在 Markdown 图片的 alt 里
   （`![标题](链接)`），普通 Markdown 链接 `[标题](链接)` 的文字也会被当作标题。
2. 工作流 `.github/workflows/gallery-submission.yml`（`issues` 事件，跑在默认分支上，
   fork 的 PR 拿不到 secrets）安装依赖后执行
   `.github/scripts/process-gallery-submission.mjs`：
   - `lib/image-url.mjs` 解析链接：支持 `![alt](url)`、`[text](url)`、`<url>`、裸 URL，
     一行多张，同 URL 去重，并自动剥离尾部的 `）`、`"`、`》`、`】`、中文标点等
     （历史 bug：链接后跟全角括号或引号时会被吞进 URL）
   - 校验：`content-type` 必须是 `image/*`，单文件 ≤ 40MB，sharp 能解析出宽高
   - `lib/image-variants.mjs` 生成 thumb/full webp + 原图归档，`lib/upload-image.mjs`
     逐个 `putObject` 后 `headObject` 复核；单张失败不影响其它图片
   - 只往 `settings.json` 追加公开地址，PR 正文带缩略图预览与失败原因
3. 友链申请同理：`.github/scripts/process-friend-submission.mjs`，截图存
   `images/thumb/friend-<issue>.webp`，站点链接会做协议与域名校验。

本地调试（不写仓库文件、不上传）：

```bash
set -a; . .env.r2.local; set +a
ISSUE_NUMBER=999 ISSUE_BODY_FILE=/tmp/body.md DRY_RUN=1 \
  node .github/scripts/process-gallery-submission.mjs
# 可选：SETTINGS_PATH=/tmp/settings.json PR_BODY_PATH=/tmp/pr-body.md
```

相关 secrets 与 `upload-r2.yml` 相同（5 个 `R2_*`）。

## 密钥轮换（建议尽快执行）

> ⚠️ 这对 R2 凭据曾在聊天/日志里出现过。请视为已泄露，尽快在 Cloudflare 后台轮换。

1. Cloudflare Dashboard → R2 → API Tokens → 新建一个只对该桶有 Object Read & Write 权限的
   Token（不要给账户级权限，也不要给 Admin）。
2. 更新 GitHub repository secrets（`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`）与本地
   `.env.r2.local`（`.gitignore` 已覆盖）。
3. 用本文的连通性自检确认新凭据可用。
4. 在 Cloudflare 后台删除旧 Token。
5. 轮换后检查 CI 最近一次 `Upload Images to R2` 运行是否成功。

## 排障

| 现象 | 处理 |
| --- | --- |
| `缺少 R2 环境变量：...` | 没有加载凭据，执行 `set -a; . .env.r2.local; set +a`（或配置到 CI secrets） |
| `R2 PUT ... 失败：HTTP 403` | Token 权限不足或已被轮换删除 |
| `R2 PUT ... 失败：HTTP 404` | `R2_BUCKET` 或 `R2_ENDPOINT` 配置错误 |
| 公开 URL 404 | 桶未绑定自定义域，或对象 key 拼写不符；用 `headObject` 确认对象存在 |
| CI 里 sharp 安装失败 | 确认 `pnpm install --frozen-lockfile` 成功执行（工作流已包含） |
