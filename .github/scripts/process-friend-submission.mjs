// 解析友链申请 Issue：把站点截图/头像转存到 R2，并把条目写进 settings.json
// 运行环境：GitHub Actions (Node 20+)，也可本地调试：
//   ISSUE_NUMBER=99 ISSUE_BODY_FILE=/tmp/body.md DRY_RUN=1 node .github/scripts/process-friend-submission.mjs
//
// 与旧实现相比：
// - 截图链接解析交给 lib/image-url.mjs，尾部 ）" 》 等标点不会再被吞进 URL
// - 截图上传 R2（卡片用 800w webp），仓库不再新增图片文件
// - 站点名称 / 链接 / 描述做长度与协议校验，缺字段直接跳过并在 PR 正文里说明
import { readFile, writeFile } from 'node:fs/promises';
import { appendFileSync } from 'node:fs';
import { extractImageEntries, sanitizeImageUrl } from '../../lib/image-url.mjs';
import { ingestImageToR2 } from '../../lib/upload-image.mjs';

const ISSUE_NUMBER = process.env.ISSUE_NUMBER;
const ISSUE_AUTHOR = process.env.ISSUE_AUTHOR || 'unknown';
const DRY_RUN = process.env.DRY_RUN === '1';
const GITHUB_OUTPUT = process.env.GITHUB_OUTPUT;
const SETTINGS_PATH = process.env.SETTINGS_PATH || 'settings.json';
const PR_BODY_PATH = process.env.PR_BODY_PATH || 'pr-body.md';

const MAX_NAME = 60;
const MAX_DESC = 200;
const MAX_URL = 300;

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

function clamp(text, max) {
  const value = (text || '').replace(/\s+/g, ' ').trim();
  return value.length > max ? value.slice(0, max) : value;
}

/** 站点链接必须是 http(s)，并做清洗（用户常把链接写在括号/引号里） */
function normalizeSiteUrl(raw) {
  const candidate = sanitizeImageUrl(raw) || (raw || '').trim();
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function main() {
  if (!ISSUE_NUMBER) throw new Error('ISSUE_NUMBER 环境变量未设置');

  const body = await readIssueBody();
  const name = clamp(extractSection(body, '站点名称'), MAX_NAME);
  const rawUrl = extractSection(body, '站点链接');
  const desc = clamp(extractSection(body, '描述（可选）'), MAX_DESC);
  const imageSection = extractSection(body, '站点截图 / 头像');

  const url = normalizeSiteUrl(rawUrl);
  if (!name || !url) {
    setOutput('has-friend', 'false');
    console.log(`缺少有效的站点名称或链接，跳过。（name=${JSON.stringify(name)} url=${JSON.stringify(rawUrl)}）`);
    return;
  }

  // 截图：优先 Markdown 小节，其次整篇正文里的第一个链接
  const imageUrl =
    extractImageEntries(imageSection)[0]?.url ||
    extractImageEntries(body)[0]?.url ||
    sanitizeImageUrl(imageSection) ||
    null;

  if (!imageUrl) {
    setOutput('has-friend', 'false');
    console.log('未在 Issue 中找到截图/头像链接。');
    return;
  }

  console.log(`友链申请：${name} (${url})`);
  console.log(`截图：${imageUrl}`);

  let image;
  try {
    const result = await ingestImageToR2({ url: imageUrl, baseName: `friend-${ISSUE_NUMBER}`, dryRun: DRY_RUN });
    // 卡片尺寸不大，直接用 800w 缩略图，省带宽
    image = result.urls.thumb;
    console.log(
      `  -> ${result.width}×${result.height} ${result.format} ` +
        `${(result.bytes / 1024).toFixed(0)}KB${DRY_RUN ? '（dry-run，未上传）' : ''}`
    );
  } catch (err) {
    setOutput('has-friend', 'false');
    console.log(`截图处理失败，跳过：${err.message}`);
    return;
  }

  const friend = { name, url };
  if (desc) friend.desc = desc;
  friend.image = image;

  if (!DRY_RUN) {
    const settingsRaw = await readFile(SETTINGS_PATH, 'utf8');
    const settings = JSON.parse(settingsRaw);
    if (!Array.isArray(settings.friends)) settings.friends = [];
    settings.friends.push(friend);
    // 写回 settings.json（保持 4 空格缩进 + 末尾换行）
    await writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 4) + '\n', 'utf8');
  }

  const prBody = [
    `本 PR 添加了 Issue #${ISSUE_NUMBER} 中的友链申请，截图已转存到 R2。`,
    '',
    `提交者：@${ISSUE_AUTHOR}`,
    '',
    `| 字段 | 值 |`,
    `| --- | --- |`,
    `| 站点名称 | ${name} |`,
    `| 站点链接 | ${url} |`,
    `| 描述 | ${desc || '—'} |`,
    `| 截图 | \`${image}\` |`,
    '',
    `![${name}](${image})`,
    '',
    `Closes #${ISSUE_NUMBER}`,
    '',
  ].join('\n');

  if (!DRY_RUN) {
    await writeFile(PR_BODY_PATH, prBody, 'utf8');
  }

  setOutput('has-friend', 'true');
  console.log(DRY_RUN ? 'dry-run 完成。' : '完成。已添加友链：', friend);
  if (DRY_RUN) console.log('\n--- PR 正文预览 ---\n' + prBody);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
