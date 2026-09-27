#!/usr/bin/env node
/**
 * 上传单个文件到 R2，并用 HEAD 校验远端大小，最后打印公开 URL。
 *
 * 用法：
 *   set -a; . .env.r2.local; set +a   # 或在环境变量里配置，见 docs/r2-images.md
 *   node scripts/r2-upload-file.mjs <本地文件> [--key images/original/x.jpg] [--content-type image/jpeg]
 *
 * 说明：
 *   - 默认 key = `images/original/<文件名>`
 *   - 只读取环境变量中的凭据，不会打印任何密钥
 */

import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import {
  r2ConfigFromEnv,
  putObject,
  headObject,
  publicUrl,
  guessContentType,
} from '../lib/r2.mjs';

function parseArgs(argv) {
  const args = { file: null, key: null, contentType: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--key') {
      args.key = argv[++i];
      if (!args.key) throw new Error('--key 缺少参数');
    } else if (arg.startsWith('--key=')) {
      args.key = arg.slice('--key='.length);
    } else if (arg === '--content-type') {
      args.contentType = argv[++i];
      if (!args.contentType) throw new Error('--content-type 缺少参数');
    } else if (arg.startsWith('--content-type=')) {
      args.contentType = arg.slice('--content-type='.length);
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg.startsWith('-')) {
      throw new Error(`未知参数：${arg}`);
    } else if (!args.file) {
      args.file = arg;
    } else {
      throw new Error(`多余的参数：${arg}`);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.file) {
    console.log(
      '用法：node scripts/r2-upload-file.mjs <本地文件> [--key images/original/x.jpg] [--content-type image/jpeg]',
    );
    process.exit(args.help ? 0 : 1);
  }

  const config = r2ConfigFromEnv();
  const key = args.key || `images/original/${basename(args.file)}`;
  const contentType = args.contentType || guessContentType(args.file);

  const info = await stat(args.file);
  if (!info.isFile()) throw new Error(`不是普通文件：${args.file}`);
  const body = await readFile(args.file);

  console.log(`上传：${args.file} -> ${key}（${body.length} 字节，${contentType}）`);
  await putObject(key, body, contentType, config);

  const head = await headObject(key, config);
  if (!head) throw new Error(`上传后 HEAD 校验失败：对象不存在（key=${key}）`);
  if (head.size !== body.length) {
    throw new Error(`尺寸校验失败：本地 ${body.length} 字节，远端 ${head.size} 字节（key=${key}）`);
  }

  const url = publicUrl(key, config);
  console.log(`远端大小：${head.size} 字节（本地一致）`);
  if (head.contentType) console.log(`远端 content-type：${head.contentType}`);
  console.log(`公开 URL：${url}`);
}

main().catch((err) => {
  console.error(`错误：${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
