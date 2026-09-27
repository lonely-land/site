#!/usr/bin/env node
/**
 * 把 public/images 下的存量图片迁移到 Cloudflare R2。
 *
 * 每个源图产三份对象：
 *   images/original/<name>.<ext>   原始字节归档（content-type 按真实类型）
 *   images/full/<name>.webp        最长边 3840 / q85
 *   images/thumb/<name>.webp       宽 800 / q75
 * 变体统一由 lib/image-variants.mjs 生成，保证与投稿管线参数一致。
 *
 * settings.json 改写（仅 --apply 且未加 --skip-settings 时）：
 *   - gallery[].file 是纯文件名 -> file/full 用 full 变体 URL，thumb 用 thumb 变体 URL
 *   - friends[].image 以 /images/ 开头 -> 改写为 thumb 变体 URL（卡片图够用且省流量）
 *   外链条目一律保持原样。
 *
 * 默认 dry-run：只扫描 + 生成变体算大小 + 打印计划，绝不发起网络写请求，也不改任何文件。
 *
 * 常用参数：
 *   --apply            真正上传（默认只预览）
 *   --delete-local     每个 key 都 HEAD 校验通过后删除本地源图（隐含 --apply）
 *   --sync             CI 同步模式：= --apply + 不写 settings.json + 绝不删除本地（幂等）
 *   --skip-settings    上传但不动 settings.json
 *   --force            远端已有同名对象且大小一致时也重新上传
 *   --dir <path>       源目录（默认 <repo>/public/images）
 *   --settings <path>  设置文件（默认 <repo>/settings.json）
 *
 * 用法：
 *   set -a; . .env.r2.local; set +a   # 或在环境变量里配置，见 docs/r2-images.md
 *   node scripts/migrate-images-to-r2.mjs                # dry-run
 *   node scripts/migrate-images-to-r2.mjs --apply
 */

import { readFile, writeFile, unlink, readdir, stat } from 'node:fs/promises';
import { join, extname, basename, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeImageVariants, MAX_INPUT_BYTES } from '../lib/image-variants.mjs';
import {
  r2ConfigFromEnv,
  putObject,
  headObject,
  publicUrl,
  guessContentType,
} from '../lib/r2.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const DEFAULT_DIR = join(REPO_ROOT, 'public', 'images');
const DEFAULT_SETTINGS = join(REPO_ROOT, 'settings.json');

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.tif', '.tiff', '.heic', '.heif']);
const SKIP_DIRS = new Set(['thumb', 'full']);

function parseArgs(argv) {
  const args = {
    apply: false,
    sync: false,
    deleteLocal: false,
    skipSettings: false,
    force: false,
    dir: DEFAULT_DIR,
    settings: DEFAULT_SETTINGS,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--sync') args.sync = true;
    else if (arg === '--delete-local') args.deleteLocal = true;
    else if (arg === '--skip-settings') args.skipSettings = true;
    else if (arg === '--force') args.force = true;
    else if (arg === '--dir') args.dir = argv[++i];
    else if (arg.startsWith('--dir=')) args.dir = arg.slice('--dir='.length);
    else if (arg === '--settings') args.settings = argv[++i];
    else if (arg.startsWith('--settings=')) args.settings = arg.slice('--settings='.length);
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`未知参数：${arg}`);
  }
  if (args.sync && args.deleteLocal) {
    throw new Error('--sync 不能与 --delete-local 同时使用');
  }
  if (args.sync) {
    args.apply = true;
    args.skipSettings = true;
  }
  if (args.deleteLocal) args.apply = true;
  return args;
}

function printUsage() {
  console.log(
    [
      '用法：node scripts/migrate-images-to-r2.mjs [选项]',
      '  --apply            真正上传（默认 dry-run）',
      '  --delete-local     每个 key HEAD 校验通过后删除本地源图（隐含 --apply）',
      '  --sync             CI 同步模式：上传 + 不写 settings.json + 不删本地',
      '  --skip-settings    上传但不改 settings.json',
      '  --force            远端大小一致时也重新上传',
      '  --dir <path>       源目录（默认 public/images）',
      '  --settings <path>  设置文件（默认 settings.json）',
    ].join('\n'),
  );
}

/** 递归收集源图（跳过 thumb/、full/ 与下划线开头的目录） */
async function collectImages(dir, base = dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('_')) continue;
      out.push(...(await collectImages(full, base)));
    } else if (entry.isFile() && IMAGE_EXTS.has(extname(entry.name).toLowerCase())) {
      out.push({ full, rel: relative(base, full) });
    }
  }
  return out;
}

function stemOf(file) {
  return basename(file, extname(file));
}

function kb(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${bytes}B`;
}

/**
 * 计算 settings.json 的变更计划。
 * - gallery[]：`file` 是纯文件名的条目 -> file/thumb/full 改写为 R2 公开 URL；
 *   外链/含路径的条目保持原样。
 * - friends[]：`image` 以 `/images/` 开头的本地图 -> 改写为 thumb 公开 URL（卡片图够用且省流量）；
 *   已经是 http(s) 外链的保持原样。
 */
function planSettings(settingsPath, settings, config, scannedStems, usableStems) {
  const gallery = Array.isArray(settings.gallery) ? settings.gallery : [];
  const updates = [];
  const skips = [];
  const nextGallery = gallery.map((item, index) => {
    const file = typeof item?.file === 'string' ? item.file : '';
    if (!file) {
      skips.push({ index, file, reason: '缺少 file 字段' });
      return item;
    }
    if (/^https?:\/\//i.test(file)) {
      skips.push({ index, file, reason: '已是外链，保持原样' });
      return item;
    }
    if (file.includes('/') || file.includes('\\')) {
      skips.push({ index, file, reason: '不是纯文件名（含路径），保持原样' });
      return item;
    }
    const stem = stemOf(file);
    if (scannedStems.has(stem) && !usableStems.has(stem)) {
      skips.push({ index, file, reason: '本次生成/上传失败，暂不改写' });
      return item;
    }
    const fullKey = `images/full/${stem}.webp`;
    const thumbKey = `images/thumb/${stem}.webp`;
    const next = {
      ...item,
      file: publicUrl(fullKey, config),
      thumb: publicUrl(thumbKey, config),
      full: publicUrl(fullKey, config),
    };
    updates.push({
      index,
      stem,
      found: scannedStems.has(stem),
      file: next.file,
      thumb: next.thumb,
      full: next.full,
    });
    return next;
  });

  const friends = Array.isArray(settings.friends) ? settings.friends : [];
  const friendUpdates = [];
  const friendSkips = [];
  const nextFriends = friends.map((item, index) => {
    const image = typeof item?.image === 'string' ? item.image : '';
    if (!image) {
      friendSkips.push({ index, image, reason: '缺少 image 字段' });
      return item;
    }
    if (/^https?:\/\//i.test(image)) {
      friendSkips.push({ index, image, reason: '已是外链，保持原样' });
      return item;
    }
    if (!image.startsWith('/images/')) {
      friendSkips.push({ index, image, reason: '不是 /images/ 本地路径，保持原样' });
      return item;
    }
    const stem = stemOf(image);
    if (scannedStems.has(stem) && !usableStems.has(stem)) {
      friendSkips.push({ index, image, reason: '本次生成/上传失败，暂不改写' });
      return item;
    }
    const nextImage = publicUrl(`images/thumb/${stem}.webp`, config);
    friendUpdates.push({ index, stem, found: scannedStems.has(stem), image: nextImage });
    return { ...item, image: nextImage };
  });

  const nextSettings = { ...settings };
  if (Array.isArray(settings.gallery)) nextSettings.gallery = nextGallery;
  if (Array.isArray(settings.friends)) nextSettings.friends = nextFriends;
  const serialized = JSON.stringify(nextSettings, null, 4) + '\n';
  return {
    nextSettings,
    serialized,
    updates,
    skips,
    friendUpdates,
    friendSkips,
    path: settingsPath,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  const dryRun = !args.apply;
  const config = r2ConfigFromEnv();

  console.log('=== 图片迁移到 Cloudflare R2 ===');
  console.log(`模式：${dryRun ? 'dry-run（不发起上传/删除/写文件）' : 'apply（真实上传）'}`);
  console.log(`源目录：${args.dir}`);
  console.log(`桶：${config.bucket}  公开域：${config.publicBase}`);
  console.log('');

  let sources;
  try {
    sources = await collectImages(args.dir);
  } catch (err) {
    // 迁移完成后 public/images 会被删除，CI 手动触发会走到不存在的目录：
    // sync 模式视为「没有待上传的图片」，保持幂等成功。
    if (args.sync && err && err.code === 'ENOENT') {
      console.log(`源目录不存在（${args.dir}），没有待上传的图片，跳过。`);
      return;
    }
    throw new Error(`无法读取源目录 ${args.dir}：${err instanceof Error ? err.message : err}`);
  }
  if (sources.length === 0) {
    if (args.sync) {
      console.log(`源目录没有图片（${args.dir}），没有待上传的图片，跳过。`);
      return;
    }
    throw new Error(`源目录下没有找到图片：${args.dir}`);
  }

  const stems = new Set(sources.map((s) => stemOf(s.rel)));
  if (stems.size !== sources.length) {
    throw new Error('存在同名（basename 冲突）的图片，key 布局会互相覆盖，请先改名');
  }

  let settings = null;
  try {
    settings = JSON.parse(await readFile(args.settings, 'utf8'));
  } catch (err) {
    if (dryRun) {
      console.log(`提示：无法读取 ${args.settings}（${err.message}），跳过 settings 变更预览\n`);
    } else {
      throw new Error(`无法读取 settings 文件 ${args.settings}：${err.message}`);
    }
  }

  const totals = { files: 0, objects: 0, bytes: 0, uploaded: 0, skipped: 0, failed: 0, deleted: 0 };
  const failedStems = new Set();

  for (let i = 0; i < sources.length; i += 1) {
    const src = sources[i];
    const stem = stemOf(src.rel);
    const label = `[${i + 1}/${sources.length}] ${src.rel}`;
    const info = await stat(src.full);
    if (info.size > MAX_INPUT_BYTES) {
      console.log(`${label} 失败：${kb(info.size)} 超过单文件上限 ${MAX_INPUT_BYTES / 1024 / 1024}MB`);
      totals.failed += 1;
      failedStems.add(stem);
      continue;
    }

    let variants;
    try {
      const buffer = await readFile(src.full);
      variants = await makeImageVariants(buffer);
    } catch (err) {
      console.log(`${label} 失败：生成变体出错（${err instanceof Error ? err.message : err}）`);
      totals.failed += 1;
      failedStems.add(stem);
      continue;
    }
    const targets = [
      {
        kind: 'original',
        key: `images/original/${stem}${variants.ext}`,
        body: variants.original,
        contentType: guessContentType(`${stem}${variants.ext}`),
      },
      {
        kind: 'full',
        key: `images/full/${stem}.webp`,
        body: variants.full,
        contentType: 'image/webp',
      },
      {
        kind: 'thumb',
        key: `images/thumb/${stem}.webp`,
        body: variants.thumb,
        contentType: 'image/webp',
      },
    ];

    console.log(`${label}（源 ${kb(info.size)}，${variants.width}x${variants.height} ${variants.format}）`);
    totals.files += 1;

    const rows = [];
    for (const target of targets) {
      const row = {
        kind: target.kind,
        key: target.key,
        bytes: target.body.length,
        url: publicUrl(target.key, config),
        status: 'dry-run',
      };
      if (!dryRun) {
        try {
          const existing = args.force ? null : await headObject(target.key, config);
          if (existing && existing.size === target.body.length) {
            row.status = '已存在（大小一致，跳过上传）';
            totals.skipped += 1;
          } else {
            await putObject(target.key, target.body, target.contentType, config);
            const head = await headObject(target.key, config);
            if (!head || head.size !== target.body.length) {
              throw new Error(
                `HEAD 校验失败：期望 ${target.body.length} 字节，实际 ${head ? head.size : '对象不存在'}`,
              );
            }
            row.status = '上传并校验通过';
            totals.uploaded += 1;
          }
        } catch (err) {
          row.status = `失败：${err instanceof Error ? err.message : err}`;
          totals.failed += 1;
        }
      }
      totals.objects += 1;
      totals.bytes += target.body.length;
      rows.push(row);
      console.log(`  ${row.kind.padEnd(8)} ${row.key}  ${String(row.bytes).padStart(9)}B  ${row.status}`);
      console.log(`           ${row.url}`);
    }

    if (!dryRun && args.deleteLocal) {
      const ok = rows.every((r) => !r.status.startsWith('失败'));
      if (!ok) {
        console.log('  本地源图未删除：存在校验失败的 key');
      } else {
        // 删除前再做一次全量 HEAD 校验，确保三个 key 都在且大小一致
        const verified = await Promise.all(
          rows.map(async (r) => {
            const head = await headObject(r.key, config);
            return Boolean(head) && head.size === r.bytes;
          }),
        );
        if (verified.every(Boolean)) {
          await unlink(src.full);
          totals.deleted += 1;
          console.log(`  已删除本地源图：${src.rel}`);
        } else {
          console.log('  本地源图未删除：删除前 HEAD 复核未通过');
        }
      }
    }

    if (rows.some((r) => r.status.startsWith('失败'))) failedStems.add(stem);
  }

  console.log('\n=== 汇总 ===');
  console.log(`图片文件：${totals.files}`);
  console.log(
    `对象：${totals.objects}（上传 ${totals.uploaded}，跳过 ${totals.skipped}，失败 ${totals.failed}，dry-run ${dryRun ? totals.objects : 0}）`,
  );
  console.log(`总字节：${totals.bytes}（${kb(totals.bytes)}）`);
  if (args.deleteLocal) console.log(`已删除本地源图：${totals.deleted}`);

  if (settings) {
    const usableStems = new Set([...stems].filter((s) => !failedStems.has(s)));
    const plan = planSettings(args.settings, settings, config, stems, usableStems);
    console.log(`\n=== settings.json（${relative(process.cwd(), plan.path) || plan.path}）===`);
    for (const u of plan.updates) {
      console.log(
        `  更新 gallery [${u.index}] ${u.stem}${u.found ? '' : '（本地未扫描到对应图片，仍按 R2 路径写入）'}`,
      );
      console.log(`    file  -> ${u.file}`);
      console.log(`    thumb -> ${u.thumb}`);
    }
    for (const s of plan.skips) {
      console.log(`  跳过 gallery [${s.index}] ${s.file || '(空)'}：${s.reason}`);
    }
    console.log(`  gallery 小计：更新 ${plan.updates.length} 条，跳过 ${plan.skips.length} 条`);

    for (const u of plan.friendUpdates) {
      console.log(
        `  更新 friends [${u.index}] ${u.stem}${u.found ? '' : '（本地未扫描到对应图片，仍按 R2 路径写入）'}`,
      );
      console.log(`    image -> ${u.image}`);
    }
    for (const s of plan.friendSkips) {
      console.log(`  跳过 friends [${s.index}] ${s.image || '(空)'}：${s.reason}`);
    }
    console.log(`  friends 小计：更新 ${plan.friendUpdates.length} 条，跳过 ${plan.friendSkips.length} 条`);

    if (dryRun) {
      console.log('  dry-run：不写入文件');
    } else if (args.skipSettings) {
      console.log('  --sync/--skip-settings：不写入 settings.json');
    } else {
      const before = await readFile(plan.path, 'utf8');
      if (before === plan.serialized) {
        console.log('  settings.json 无变化，不写入');
      } else {
        await writeFile(plan.path, plan.serialized, 'utf8');
        console.log(`  已写入 settings.json（4 空格缩进 + 末尾换行）`);
      }
    }
  }

  if (totals.failed > 0) {
    console.error(`\n有 ${totals.failed} 个对象失败`);
    process.exit(1);
  }

  if (dryRun) {
    console.log('\n提示：当前为 dry-run。确认无误后加 --apply 真正上传（--delete-local 才会删本地图）。');
  }
}

main().catch((err) => {
  console.error(`错误：${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
