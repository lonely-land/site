// 图片变体生成（Node 侧脚本共用：投稿处理、R2 迁移都走这里，保证参数一致）
//
// 参数与仓库原有的 scripts/gen-thumbs.mjs 保持一致：
//   缩略图 800w / quality 75，大图最长边 3840 / quality 85
// 用 sharp 重新编码同时起到「消毒」作用：无论上游给的是 SVG、HTML 还是带怪异
// 元数据的图片，落到 R2 的产物都是干净的 webp，不会把可执行内容传到公开域名上。
import sharp from 'sharp';

export const THUMB_WIDTH = 800;
export const FULL_MAX = 3840;
export const THUMB_QUALITY = 75;
export const FULL_QUALITY = 85;

/** 单个投稿文件的大小上限（超过直接拒绝，避免被塞超大文件） */
export const MAX_INPUT_BYTES = 40 * 1024 * 1024;

const EXT_BY_FORMAT = {
  jpeg: '.jpg',
  jpg: '.jpg',
  png: '.png',
  webp: '.webp',
  gif: '.gif',
  avif: '.avif',
  tiff: '.tiff',
  heif: '.heif',
};

/**
 * 生成原图归档 + 灯箱大图 + 列表缩略图三种产物。
 * @param {Buffer} buffer 输入图片字节
 * @returns {Promise<{ original: Buffer, ext: string, format: string, width: number, height: number, full: Buffer, thumb: Buffer }>}
 */
export async function makeImageVariants(buffer) {
  if (!buffer || buffer.length === 0) throw new Error('图片内容为空');
  if (buffer.length > MAX_INPUT_BYTES) {
    throw new Error(`图片过大：${(buffer.length / 1024 / 1024).toFixed(1)}MB > 上限 ${MAX_INPUT_BYTES / 1024 / 1024}MB`);
  }

  const meta = await sharp(buffer, { failOn: 'none' }).metadata();
  if (!meta.width || !meta.height) throw new Error('无法解析为图片（缺少宽高信息）');

  const format = meta.format || 'unknown';
  const ext = EXT_BY_FORMAT[format] || '.bin';

  const [full, thumb] = await Promise.all([
    sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize({ width: FULL_MAX, height: FULL_MAX, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: FULL_QUALITY })
      .toBuffer(),
    sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .webp({ quality: THUMB_QUALITY })
      .toBuffer(),
  ]);

  return { original: buffer, ext, format, width: meta.width, height: meta.height, full, thumb };
}
