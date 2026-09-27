/**
 * Cloudflare R2 传输层（纯 ESM，零新增依赖）。
 *
 * 依赖：Node 18+ 的全局 fetch、node:crypto。
 * 认证：手写 AWS SigV4（service=s3, region=auto），适配 R2 的 S3 兼容接口。
 *
 * 环境变量（缺一不可）：
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_ENDPOINT         例如 https://<accountid>.r2.cloudflarestorage.com
 *   R2_BUCKET
 *   R2_PUBLIC_BASE      公开访问域，例如 https://land.c0ffee.space
 *
 * 安全约定：本模块永不打印/返回密钥内容，错误信息里只出现 key 与 HTTP 状态码。
 */

import { createHash, createHmac } from 'node:crypto';
import { extname } from 'node:path';

const ALGORITHM = 'AWS4-HMAC-SHA256';
const REGION = 'auto';
const SERVICE = 's3';
const EMPTY_SHA256 = createHash('sha256').update('').digest('hex');

const REQUIRED_ENV = [
  'R2_ENDPOINT',
  'R2_BUCKET',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_PUBLIC_BASE',
];

const CONTENT_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

/**
 * 从环境变量解析 R2 配置。
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ endpoint: string, bucket: string, accessKeyId: string, secretAccessKey: string, publicBase: string }}
 */
export function r2ConfigFromEnv(env = process.env) {
  const missing = REQUIRED_ENV.filter((name) => !String(env?.[name] ?? '').trim());
  if (missing.length > 0) {
    throw new Error(
      `缺少 R2 环境变量：${missing.join(', ')}。` +
        '请先在环境变量或 .env.r2.local（已在 .gitignore 中）里配置，例如：' +
        'set -a; . .env.r2.local; set +a。详见 docs/r2-images.md。',
    );
  }

  return {
    endpoint: String(env.R2_ENDPOINT).trim().replace(/\/+$/, ''),
    bucket: String(env.R2_BUCKET).trim(),
    accessKeyId: String(env.R2_ACCESS_KEY_ID).trim(),
    secretAccessKey: String(env.R2_SECRET_ACCESS_KEY).trim(),
    publicBase: String(env.R2_PUBLIC_BASE).trim().replace(/\/+$/, ''),
  };
}

/**
 * key -> 公开 URL。
 * @param {string} key
 * @param {{ publicBase?: string }} [config] 省略时从环境变量读取
 * @returns {string}
 */
export function publicUrl(key, config = r2ConfigFromEnv()) {
  const publicBase = String(config?.publicBase ?? '').replace(/\/+$/, '');
  if (!publicBase) {
    throw new Error('publicUrl: 缺少 publicBase（R2_PUBLIC_BASE）');
  }
  const cleanKey = String(key).replace(/^\/+/, '');
  if (!cleanKey) {
    throw new Error('publicUrl: key 不能为空');
  }
  return `${publicBase}/${cleanKey}`;
}

/**
 * 根据文件路径/名称猜测 content-type。
 * @param {string} path
 * @returns {string}
 */
export function guessContentType(path) {
  const ext = extname(String(path ?? '')).toLowerCase();
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

/**
 * 上传对象（PUT）。
 * @param {string} key
 * @param {Buffer | Uint8Array} body
 * @param {string} contentType
 * @param {object} [config] 省略时从环境变量读取
 * @returns {Promise<void>}
 */
export async function putObject(key, body, contentType, config = r2ConfigFromEnv()) {
  if (typeof key !== 'string' || key.length === 0) {
    throw new Error('putObject: key 不能为空');
  }
  const payload = toUint8Array(body);
  await request('PUT', key, config, {
    body: payload,
    payloadHash: sha256Hex(payload),
    headers: { 'content-type': contentType || 'application/octet-stream' },
  });
}

/**
 * HEAD 对象。不存在返回 null。
 * @param {string} key
 * @param {object} [config]
 * @returns {Promise<{ size: number, contentType?: string } | null>}
 */
export async function headObject(key, config = r2ConfigFromEnv()) {
  const res = await request('HEAD', key, config, { payloadHash: EMPTY_SHA256 });
  if (res === null) return null;
  const sizeRaw = res.headers.get('content-length');
  const size = sizeRaw === null ? 0 : Number(sizeRaw);
  if (!Number.isFinite(size)) {
    throw new Error(`headObject: 响应中的 content-length 非法（key=${key}）`);
  }
  const contentType = res.headers.get('content-type') || undefined;
  return { size, contentType };
}

/**
 * 删除对象（DELETE）。对象已不存在时视为成功（幂等）。
 * @param {string} key
 * @param {object} [config]
 * @returns {Promise<void>}
 */
export async function deleteObject(key, config = r2ConfigFromEnv()) {
  await request('DELETE', key, config, { payloadHash: EMPTY_SHA256 });
}

/* ------------------------------------------------------------------ */
/* 内部实现                                                            */
/* ------------------------------------------------------------------ */

function toUint8Array(body) {
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return body;
  if (typeof body === 'string') return Buffer.from(body, 'utf8');
  throw new Error('putObject: body 必须是 Buffer / Uint8Array / string');
}

function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key, data) {
  return createHmac('sha256', key).update(data).digest();
}

function encodeKeyPath(key) {
  return String(key)
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function amzDate(now = new Date()) {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

function canonicalRequest({ method, canonicalUri, canonicalHeaders, signedHeaders, payloadHash }) {
  return [
    method,
    canonicalUri,
    '', // canonical query string：本模块只做对象级 PUT/HEAD/DELETE，无查询参数
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
}

function signingKey(secretAccessKey, dateStamp) {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  return hmac(kService, 'aws4_request');
}

/**
 * 发一次已签名的请求。返回 Response；404 时返回 null。
 * 网络错误/5xx 自动重试（最多 3 次）。
 */
async function request(method, key, config, { body, payloadHash, headers = {} }) {
  const { amzDate: amz, dateStamp } = amzDate();
  const canonicalUri = `/${encodeURIComponent(config.bucket)}/${encodeKeyPath(key)}`;
  const url = `${config.endpoint}${canonicalUri}`;

  const headerEntries = {
    host: new URL(config.endpoint).host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amz,
  };
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined && value !== null && String(value).length > 0) {
      headerEntries[name.toLowerCase()] = String(value).trim();
    }
  }

  const sortedNames = Object.keys(headerEntries).sort();
  const canonicalHeaders = sortedNames.map((name) => `${name}:${headerEntries[name]}\n`).join('');
  const signedHeaders = sortedNames.join(';');
  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [
    ALGORITHM,
    amz,
    credentialScope,
    sha256Hex(
      canonicalRequest({
        method,
        canonicalUri,
        canonicalHeaders,
        signedHeaders,
        payloadHash,
      }),
    ),
  ].join('\n');

  const signature = createHmac('sha256', signingKey(config.secretAccessKey, dateStamp))
    .update(stringToSign)
    .digest('hex');

  const outHeaders = { ...headers };
  outHeaders['x-amz-content-sha256'] = payloadHash;
  outHeaders['x-amz-date'] = amz;
  outHeaders.authorization =
    `${ALGORITHM} Credential=${config.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(url, { method, headers: outHeaders, body });
      if (res.status === 404) return null;
      if (res.ok) return res;
      if (res.status >= 500 && attempt < 3) {
        lastError = new Error(`R2 ${method} ${key} 失败：HTTP ${res.status} ${await safeText(res)}`);
        await sleep(400 * attempt);
        continue;
      }
      throw new Error(`R2 ${method} ${key} 失败：HTTP ${res.status} ${await safeText(res)}`);
    } catch (err) {
      lastError = err;
      // 已确认的 HTTP 错误不再重试
      if (!(err instanceof Error) || !/失败：HTTP 4\d\d/.test(err.message)) {
        if (attempt < 3) {
          await sleep(400 * attempt);
          continue;
        }
      }
      throw err;
    }
  }
  throw lastError ?? new Error(`R2 ${method} ${key} 失败：未知错误`);
}

async function safeText(res) {
  try {
    const text = await res.text();
    return text.slice(0, 300);
  } catch {
    return '';
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
