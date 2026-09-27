// 解析图片投稿 Issue：把图片转存到 R2，并把公开地址写进 settings.json
// 运行环境：GitHub Actions (Node 20+)，也可本地调试：
//   ISSUE_NUMBER=99 ISSUE_BODY_FILE=/tmp/body.md DRY_RUN=1 node .github/scripts/process-gallery-submission.mjs
//
// 约定：图片标题写在 Markdown 图片的 alt 文本里
//   ![这是标题](https://...)  -> 有标题
//   ![](https://...)         -> 无标题
//
// 与旧实现相比：
// - 链接解析交给 lib/image-url.mjs，尾部 ）" 》 等标点不会再被吞进 URL
// - 图片不再提交进仓库：重新编码成 webp（原图归档 + 灯箱大图 + 列表缩略图）后上传 R2
// - 单张失败不影响其它图片，失败原因写进 PR 正文
import { readFile, writeFile } from 'node:fs/promises';
import { appendFileSync } from 'node:fs';
import { extractImageEntries } from '../../lib/image-url.mjs';
import { ingestImageToR2 } from '../../lib/upload-image.mjs';

const ISSUE_NUMBER = process.env.ISSUE_NUMBER;
const ISSUE_AUTHOR = process.env.ISSUE_AUTHOR || 'unknown';
const DRY_RUN = process.env.DRY_RUN === '1';
const MAX_IMAGES = Number(process.env.MAX_IMAGES || 20);
const GITHUB_OUTPUT = process.env.GITHUB_OUTPUT;
const SETTINGS_PATH = process.env.SETTINGS_PATH || 'settings.json';
const PR_BODY_PATH = process.env.PR_BODY_PATH || 'pr-body.md';

async function readIssueBody() {
  if (process.env.ISSUE_BODY_FILE) return readFile(process.env.ISSUE_BODY_FILE, 'utf8');
  return process.env.ISSUE_BODY || '';
}

// 从 Issue 正文（表单格式）中提取指定小节内容
function extractSection(body, label) {
  const regex = new RegExp(
    `^###\\s+${label}\\s*\\r?\\n([\\s\\S]*?)(?=\\r?\\n###\\s|(?![\\s\\S]))`,
    'im'
  );
  const match = body.match(regex);
  if (!match) return '';
  return match[1].trim();
}

function setOutput(key, value) {
  if (!GITHUB_OUTPUT) return;
  appendFileSync(GITHUB_OUTPUT, `${key}=${value}\n`);
}

function setOutputMultiline(key, value) {
  if (!GITHUB_OUTPUT) return;
  const delimiter = `EOF_${key}`;
  appendFileSync(GITHUB_OUTPUT, `${key}<<${delimiter}\n${value}\n${delimiter}\n`);
}

/** settings.json 里已经收录过的地址（file / thumb / full 都算） */
function existingUrls(settings) {
  const urls = new Set();
  for (const item of settings.gallery || []) {
    for (const key of ['file', 'thumb', 'full']) {
      if (typeof item?.[key] === 'string') urls.add(item[key]);
    }
  }
  return urls;
}

async function main() {
  if (!ISSUE_NUMBER) throw new Error('ISSUE_NUMBER 环境变量未设置');

  const body = await readIssueBody();
  const section = extractSection(body, '图片');
  // 表单小节为空时回退到整篇正文：容忍用户把图片贴在其它位置
  const parsed = extractImageEntries(section || body);

  if (parsed.length === 0) {
    setOutput('has-images', 'false');
    console.log('未在 Issue 中找到图片。');
    return;
  }

  const settingsRaw = await readFile(SETTINGS_PATH, 'utf8');
  const settings = JSON.parse(settingsRaw);
  if (!Array.isArray(settings.gallery)) settings.gallery = [];

  const seen = existingUrls(settings);
  const todo = [];
  const skipped = [];
  for (const entry of parsed) {
    if (seen.has(entry.url)) {
      skipped.push({ url: entry.url, reason: '已在 settings.json 中' });
      continue;
    }
    seen.add(entry.url);
    todo.push(entry);
  }

  const overflow = todo.length > MAX_IMAGES ? todo.splice(MAX_IMAGES) : [];
  console.log(
    `解析到 ${parsed.length} 张图片：待处理 ${todo.length}，跳过 ${skipped.length}，超出上限 ${overflow.length}。`
  );

  const added = [];
  const failed = [];

  for (let i = 0; i < todo.length; i++) {
    const entry = todo[i];
    const baseName = `gallery-${ISSUE_NUMBER}-${i + 1}`;
    console.log(`(${i + 1}/${todo.length}) ${entry.url}`);
    try {
      const result = await ingestImageToR2({ url: entry.url, baseName, dryRun: DRY_RUN });

      const item = {};
      if (entry.title) item.name = entry.title;
      item.file = result.urls.full;
      item.thumb = result.urls.thumb;
      settings.gallery.push(item);

      added.push({ ...entry, ...result });
      console.log(
        `  -> ${result.width}×${result.height} ${result.format} ` +
          `${(result.bytes / 1024).toFixed(0)}KB${DRY_RUN ? '（dry-run，未上传）' : ''}`
      );
    } catch (err) {
      failed.push({ url: entry.url, reason: err.message });
      console.warn(`  -> 跳过：${err.message}`);
    }
  }

  if (added.length === 0) {
    setOutput('has-images', 'false');
    console.log('没有成功处理的图片，不创建 PR。');
    if (failed.length) console.log('失败明细：', failed);
    return;
  }

  if (!DRY_RUN) {
    // 写回 settings.json（保持 4 空格缩进 + 末尾换行）
    await writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 4) + '\n', 'utf8');
  }

  const host = added[0].urls.thumb.replace(/\/images\/.*$/, '');
  const lines = [
    `本 PR 把 Issue #${ISSUE_NUMBER} 中提交的 ${added.length} 张图片转存到了 R2（\`${host}\`），`,
    `仓库不再新增图片文件，\`settings.json\` 只记录公开地址。`,
    '',
    `提交者：@${ISSUE_AUTHOR}`,
    '',
    '## 新增图片',
    '',
  ];

  added.forEach((it, i) => {
    const title = it.title ? `**${it.title}**` : `图片 ${i + 1}`;
    lines.push(`${i + 1}. ${title} — \`${it.keys.full}\``);
    lines.push(`   ![${it.title || `图片 ${i + 1}`}](${it.urls.thumb})`);
  });

  if (skipped.length || failed.length || overflow.length) {
    lines.push('', '## 未处理', '');
    skipped.forEach((it) => lines.push(`- \`${it.url}\` — ${it.reason}`));
    failed.forEach((it) => lines.push(`- \`${it.url}\` — ${it.reason}`));
    overflow.forEach((it) => lines.push(`- \`${it.url}\` — 超过单次上限 ${MAX_IMAGES} 张`));
  }

  lines.push('', `Closes #${ISSUE_NUMBER}`, '');
  const prBody = lines.join('\n');

  if (!DRY_RUN) {
    await writeFile(PR_BODY_PATH, prBody, 'utf8');
  }

  const summary = added
    .map((it, i) => `${i + 1}. \`${it.keys.full}\`${it.title ? ` — ${it.title}` : ''}`)
    .join('\n');
  setOutput('has-images', 'true');
  setOutputMultiline('summary', summary);

  console.log(DRY_RUN ? 'dry-run 完成。' : '完成。已转存：');
  console.log(summary);
  if (DRY_RUN) console.log('\n--- PR 正文预览 ---\n' + prBody);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
