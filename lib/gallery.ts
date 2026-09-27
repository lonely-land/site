/**
 * 画廊图片地址解析
 *
 * 图片有三种来源，函数都支持：
 *
 * 1. 仓库内文件：`file` 是纯文件名（如 `gallery-main.png`）
 *    → /images/<file>，缩略图/大图走本地生成的 thumb/ 、full/ 目录
 * 2. R2 对象存储：`file` 是 https://land.c0ffee.space/images/full/<name>.webp
 *    → 缩略图按 R2 的目录约定换成 images/thumb/<name>.webp，
 *      这样 settings.json 只需要写一个地址，不用维护两份
 * 3. 第三方外链：没有变体，thumb/full 都直接用原图
 *
 * 条目显式写了 `thumb` / `full` 字段时优先使用（外链想自指定变体时用得上）。
 */
export type GalleryItem = {
  name?: string;
  /** 主图地址：纯文件名（仓库内）或完整 https 外链（R2 / 第三方） */
  file: string;
  /** 可选：显式指定缩略图，缺省按约定推导 */
  thumb?: string;
  /** 可选：显式指定大图，缺省按约定推导 */
  full?: string;
};

/** 兼容旧的 `thumbSrc(file)` 调用方式：字符串等价于只有 file 的条目 */
type ImageRef = GalleryItem | string;

/** R2 上的目录约定：images/(original|full|thumb)/<name> */
const VARIANT_DIR = /\/images\/(?:original|full|thumb)\//;

function toItem(ref: ImageRef): GalleryItem {
  return typeof ref === 'string' ? { file: ref } : ref;
}

function isExternal(file: string): boolean {
  return file.startsWith('https://');
}

function baseName(file: string): string {
  const name = file.split('/').pop() || file;
  return name.replace(/\.[^.]+$/, '');
}

/** 把 R2 地址里的变体目录替换掉；不是 R2 变体路径时返回 null */
function withVariant(url: string, variant: 'thumb' | 'full'): string | null {
  if (!VARIANT_DIR.test(url)) return null;
  return url.replace(VARIANT_DIR, `/images/${variant}/`);
}

/** 原图（图片加载失败时的兜底） */
export function imgSrc(ref: ImageRef): string {
  const item = toItem(ref);
  if (item.full) return item.full;
  return isExternal(item.file) ? item.file : `/images/${item.file}`;
}

/** 列表缩略图 */
export function thumbSrc(ref: ImageRef): string {
  const item = toItem(ref);
  if (item.thumb) return item.thumb;
  if (isExternal(item.file)) return withVariant(item.file, 'thumb') ?? item.file;
  return `/images/thumb/${baseName(item.file)}.webp`;
}

/** 灯箱大图 */
export function fullSrc(ref: ImageRef): string {
  const item = toItem(ref);
  if (item.full) return item.full;
  if (isExternal(item.file)) return withVariant(item.file, 'full') ?? item.file;
  return `/images/full/${baseName(item.file)}.webp`;
}
