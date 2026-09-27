// 图片 URL 清洗与提取工具：纯 ESM、零依赖，Node 18+ 可直接运行。
//
// 背景：Issue 表单里的链接常和中文标点/引号挤在一起，例如
//   ![标题](https://e.com/a.png）
//   ![](https://e.com/b.jpg"
// 旧正则只排除了 ASCII 的 `)`，会把 `）`、`"` 一起吞进 URL，导致下载 404。
// 这里集中做清洗与提取，调用方只拿干净的 URL，不必各自处理标点。

// 常见图片扩展名
const IMAGE_EXTS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.avif',
  '.svg',
  '.bmp',
  '.ico',
  '.tif',
  '.tiff',
]);

// 不带扩展名的图床：GitHub Issue 上传的图片就是
// https://github.com/user-attachments/assets/<uuid> 这种没有后缀的形式。
const IMAGE_HOSTS = new Set([
  'user-images.githubusercontent.com',
  'private-user-images.githubusercontent.com',
  'i.imgur.com',
  'pbs.twimg.com',
  'cdn.discordapp.com',
  'images.unsplash.com',
]);
const IMAGE_PATH_HINTS = ['/user-attachments/assets/'];

// URL 里不可能出现的字符：空白、尖括号、引号、中文标点。
// 必须排除中文标点，否则「https://e.com/a.png，谢谢」会把「，谢谢」一起吃进 URL；
// 中文字符本身不排除，因为中文文件名（https://e.com/图片.png）是合法的。
const URL_STOP_CHARS = String.raw`\s<>"'“”‘’「」『』（）【】《》，、；：！？。…`;
const URL_STOP_RE = new RegExp(`[${URL_STOP_CHARS}]`);

// 从一段话里找 URL
const URL_IN_TEXT_RE = new RegExp(String.raw`https?:\/\/[^${URL_STOP_CHARS}]+`, 'i');

// 整段 Markdown 链接：调用方可能直接把 `![alt](url "title")` 整段传进来。
// 允许 URL 里出现一层配对的圆括号，如 https://en.wikipedia.org/wiki/Foo_(bar)。
const MD_URL_PATTERN = String.raw`(<[^>\s]*>|[^\s()]*(?:\([^\s()]*\)[^\s()]*)*)`;
const MD_TITLE_PATTERN = String.raw`(?:\s+(?:"[^"]*"|'[^']*'|“[^”]*”|‘[^’]*’))?`;
const MD_LINK_RE = new RegExp(
  String.raw`^!?\[([^\]]*)\]\(\s*` + MD_URL_PATTERN + MD_TITLE_PATTERN + String.raw`\s*[)）]\s*$`
);

// 成对括号：只有「多出来的」右括号才当成标点剥掉，
// 这样 https://en.wikipedia.org/wiki/Foo_(bar) 能完整保留。
const BALANCED_PAIRS = [
  ['(', ')'],
  ['（', '）'],
  ['[', ']'],
  ['【', '】'],
  ['《', '》'],
];

// 尾部标点（半角 / 全角 / 中文），出现在 URL 末尾一律视为正文标点
const TRAILING_PUNCT = new Set([
  ')', '）', ']', '】', '》', '」', '』', '>',
  ',', '，', '、', ';', '；', ':', '：',
  '.', '。', '!', '！', '?', '？', '*',
  '"', "'", '”', '’', '“', '‘', '`',
]);

// 判断某个右括号是否「没有对应的左括号」，即多余的
function hasUnmatchedCloser(s, open, close) {
  let depth = 0;
  for (const ch of s) {
    if (ch === open) depth++;
    else if (ch === close) depth--;
  }
  return depth < 0;
}

// 反复剥掉尾部标点，直到遇到 URL 的合法字符
function stripTrailingPunct(input) {
  let s = input;
  while (s.length > 0) {
    const last = s.slice(-1);
    if (/\s/.test(last)) {
      s = s.slice(0, -1);
      continue;
    }
    // 悬空的 ? / # 是空 query / fragment，剥掉；真正的 ?x=1#y 结尾不是这两个字符
    if (last === '?' || last === '#') {
      s = s.slice(0, -1);
      continue;
    }
    let balancedCloser = false;
    for (const [open, close] of BALANCED_PAIRS) {
      if (last === close && !hasUnmatchedCloser(s, open, close)) {
        balancedCloser = true;
        break;
      }
    }
    if (balancedCloser) break; // 配对的右括号是 URL 的合法部分
    if (TRAILING_PUNCT.has(last)) {
      s = s.slice(0, -1);
      continue;
    }
    break;
  }
  return s;
}

// 清洗单个 URL：容错地接受整段 Markdown、尖括号自动链接、被中文括号/引号包裹的链接，
// 以及尾部带标点的裸链。无法得到合法 http(s) URL 时返回 null。
export function sanitizeImageUrl(raw) {
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  if (!s) return null;

  // 1) 整段 Markdown 链接：取出括号里的 URL
  const md = s.match(MD_LINK_RE);
  if (md) s = md[2].trim();

  // 2) 不是以 http(s) 开头，说明外面还裹着括号/引号/说明文字：找第一个 URL
  if (!/^https?:\/\//i.test(s)) {
    const found = s.match(URL_IN_TEXT_RE);
    if (!found) return null;
    s = found[0];
  }

  // 3) URL 不含字面空白，空白之后是链接标题或说明文字；
  //    中文标点 / 引号也一定不属于 URL，从这里截断，别把后面的句子吃进来
  const ws = s.search(/\s/);
  if (ws !== -1) s = s.slice(0, ws);
  const stop = s.search(URL_STOP_RE);
  if (stop !== -1) s = s.slice(0, stop);

  s = stripTrailingPunct(s);

  // 4) 只接受 http/https，且必须有主机名（排除 `https://` 这种空壳）
  if (!/^https?:\/\/[^\s/]+/i.test(s)) return null;
  return s;
}

// 从正文中提取图片条目，支持 Markdown 图片、Markdown 链接、自动链接与裸 URL，
// 按出现顺序返回并按 URL 去重。
// 标题规则：`![alt](url)` 的 alt 一定是标题；`[文字](url)` 的文字在「非空且看起来
// 不是 URL」时也当标题，方便用户手写 `[晨光](https://...)`。
const ENTRY_RE = new RegExp(
  String.raw`(!?)\[([^\]]*)\]\(\s*` +
    MD_URL_PATTERN +
    MD_TITLE_PATTERN +
    String.raw`\s*[)）]` +
    String.raw`|<(https?:\/\/[^>\s]+)>` +
    String.raw`|(https?:\/\/[^${URL_STOP_CHARS}]+)`,
  'gi'
);

export function extractImageEntries(text) {
  if (typeof text !== 'string' || text === '') return [];
  const entries = [];
  const seen = new Set();
  for (const m of text.matchAll(ENTRY_RE)) {
    const rawUrl = m[3] ?? m[4] ?? m[5];
    if (!rawUrl) continue;
    const url = sanitizeImageUrl(rawUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const entry = { url };
    const title = (m[2] || '').trim();
    if (title) {
      if (m[1] === '!') {
        // 图片语法：alt 就是标题
        entry.title = title;
      } else if (!/^https?:\/\//i.test(title) && title !== url && title !== rawUrl.trim()) {
        // 链接文字当标题，但要排除 `[https://x/a.png](https://x/a.png)` 这类把 URL 当文字写的噪音
        entry.title = title;
      }
    }
    entries.push(entry);
  }
  return entries;
}

// 从 URL 路径取图片扩展名（小写、带点）；不是已知图片后缀则返回 null
export function imageExtFromUrl(url) {
  const clean = sanitizeImageUrl(url);
  if (!clean) return null;
  let pathname;
  try {
    pathname = new URL(clean).pathname;
  } catch {
    return null;
  }
  const m = pathname.match(/\.([A-Za-z0-9]+)$/);
  if (!m) return null;
  const ext = '.' + m[1].toLowerCase();
  return IMAGE_EXTS.has(ext) ? ext : null;
}

// 判断 URL 是否「看起来是图片」。
// 光看扩展名不够：GitHub Issue 表单里上传的附件地址是
// https://github.com/user-attachments/assets/<uuid> 这种没有后缀的形式，
// 只看后缀会把用户实际提交的图片全判成非图片，所以还要认图床域名/路径白名单。
// 注意这只是启发式判断，投稿脚本仍以真实下载 + content-type / sharp 解析为准。
export function isLikelyImageUrl(url) {
  const clean = sanitizeImageUrl(url);
  if (!clean) return false;
  if (imageExtFromUrl(clean)) return true;
  try {
    const u = new URL(clean);
    if (IMAGE_HOSTS.has(u.hostname.toLowerCase())) return true;
    if (IMAGE_PATH_HINTS.some((hint) => u.pathname.startsWith(hint))) return true;
  } catch {
    return false;
  }
  return false;
}
