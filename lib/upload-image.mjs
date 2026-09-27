// 下载 → 校验 → 生成变体 → 上传 R2（投稿处理脚本共用）
//
// 设计原则：
// - 用户给什么链接都能收（GitHub 附件、图床、直链），但落进 R2 的产物一定是
//   我们重新编码过的 webp，避免把 SVG / HTML / 带脚本的内容传到公开域名上
// - 每个 key 上传后都 HEAD 复核，任何一个失败就抛错，绝不写半截数据进 settings.json
import { headObject, publicUrl, putObject } from './r2.mjs';
import { MAX_INPUT_BYTES, makeImageVariants } from './image-variants.mjs';

const FETCH_TIMEOUT_MS = 60_000;

/**
 * 下载图片并做基本校验。
 * @param {string} url
 * @returns {Promise<{ buffer: Buffer, contentType: string }>}
 */
export async function downloadImage(url, { timeoutMs = FETCH_TIMEOUT_MS, maxBytes = MAX_INPUT_BYTES } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'lonely-site-image-bot' },
    });
    if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`);

    const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (contentType && !contentType.startsWith('image/')) {
      throw new Error(`不是图片（content-type: ${contentType}）`);
    }

    const declared = Number(res.headers.get('content-length') || 0);
    if (declared > maxBytes) {
      throw new Error(`文件过大：${(declared / 1024 / 1024).toFixed(1)}MB`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0) throw new Error('下载到空文件');
    if (buffer.length > maxBytes) {
      throw new Error(`文件过大：${(buffer.length / 1024 / 1024).toFixed(1)}MB`);
    }

    return { buffer, contentType };
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error(`下载超时（${timeoutMs}ms）`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** R2 上的三种产物路径 */
export function imageKeys(baseName, ext) {
  return {
    original: `images/original/${baseName}${ext}`,
    full: `images/full/${baseName}.webp`,
    thumb: `images/thumb/${baseName}.webp`,
  };
}

/** key -> 公开 URL */
function publicUrls(keys) {
  return {
    original: publicUrl(keys.original),
    full: publicUrl(keys.full),
    thumb: publicUrl(keys.thumb),
  };
}

/**
 * 把一张远程图片转存到 R2。
 * @param {{ url: string, baseName: string, dryRun?: boolean }} params
 * @returns {Promise<{ keys: Record<string,string>, urls: Record<string,string>, width: number, height: number, format: string, bytes: number }>}
 */
export async function ingestImageToR2({ url, baseName, dryRun = false }) {
  const { buffer, contentType } = await downloadImage(url);
  const variants = await makeImageVariants(buffer);
  const keys = imageKeys(baseName, variants.ext);
  const meta = {
    width: variants.width,
    height: variants.height,
    format: variants.format,
    bytes: buffer.length,
    contentType,
  };

  if (dryRun) {
    return { keys, urls: publicUrls(keys), ...meta };
  }

  await putObject(keys.original, variants.original, contentType || `image/${variants.format}`);
  await putObject(keys.full, variants.full, 'image/webp');
  await putObject(keys.thumb, variants.thumb, 'image/webp');

  // 复核：三个 key 都必须真实存在，否则不写 settings.json
  for (const [kind, key] of Object.entries(keys)) {
    const head = await headObject(key);
    if (!head) throw new Error(`上传校验失败：${kind} 不存在（${key}）`);
  }

  return { keys, urls: publicUrls(keys), ...meta };
}
