#!/usr/bin/env node
/**
 * package-for-colleagues.mjs — 在 Win 中转机上把项目打成 zip 给同事
 *
 * 用法(必须在 Win 中转机上跑,不是 Mac):
 *   node scripts/package-for-colleagues.mjs
 *   node scripts/package-for-colleagues.mjs --out D:/chexian-share/release
 *
 * 输出:
 *   <out>/chexian-query-YYYYMMDD-<sha7>.zip
 *   默认 out = ./dist
 *
 * 打包包含:
 *   - 项目代码(scripts/ docs/ AGENTS.md CLAUDE.md package.json package-lock.json)
 *   - node_modules/(预装好的 duckdb native binary,Win 平台,不可跨平台移植)
 *   - dist-template/.env(覆盖项目根的 .env)
 *   - dist-template/update.bat(同事的更新脚本)
 *   - dist-template/README-colleague.md → README.md(覆盖原 README)
 *
 * 不包含:
 *   - 数据负责人的 .env(含 HTTPS_PASS)
 *   - 数据 data/(同事走 SMB 读)
 *   - 日志 logs/
 *   - .git/(同事不需要 git)
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, cpSync, copyFileSync, statSync, readdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

function log(msg, color = '') {
  const colors = { green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', blue: '\x1b[34m', reset: '\x1b[0m' };
  console.log(color ? `${colors[color]}${msg}${colors.reset}` : msg);
}

function fail(msg) {
  log(`[package] ${msg}`, 'red');
  process.exit(1);
}

// ===== 1. 平台检查 =====
if (platform() !== 'win32') {
  fail('必须在 Windows 上跑(duckdb 是平台相关的 native binary,Mac/Linux 打的包给 Win 同事会报错)');
}

// ===== 2. node_modules 检查 =====
const dukNode = resolve(PROJECT_ROOT, 'node_modules', 'duckdb', 'lib', 'binding', 'duckdb.node');
if (!existsSync(dukNode)) {
  fail(`找不到 ${dukNode}。先在项目根跑 \`npm install\` 装好 duckdb,再来打包。`);
}

// ===== 3. dist-template 检查 =====
const TPL = resolve(PROJECT_ROOT, 'dist-template');
const requiredTpl = ['.env', 'update.bat', 'README-colleague.md'];
for (const f of requiredTpl) {
  if (!existsSync(resolve(TPL, f))) fail(`dist-template/${f} 不存在`);
}

// ===== 4. 解析参数 =====
const args = process.argv.slice(2);
let outDir = resolve(PROJECT_ROOT, 'dist');
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') outDir = resolve(args[++i]);
}

// ===== 5. 版本号 =====
const today = new Date();
const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
let sha = 'nogit';
try {
  const r = spawnSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: PROJECT_ROOT, encoding: 'utf-8' });
  if (r.status === 0) sha = r.stdout.trim();
} catch {}
const version = `${ymd}-${sha}`;
const stagingName = 'chexian-query';
const zipName = `chexian-query-${version}.zip`;

log(`[package] 版本: ${version}`, 'blue');
log(`[package] 输出: ${resolve(outDir, zipName)}`, 'blue');

// ===== 6. 准备 staging =====
const staging = resolve(PROJECT_ROOT, '.staging-package');
if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });
const stage = resolve(staging, stagingName);
mkdirSync(stage);

// 复制项目代码(白名单)
const include = [
  'scripts',
  'docs',
  'AGENTS.md',
  'CLAUDE.md',
  'package.json',
  'package-lock.json',
];
for (const item of include) {
  const src = resolve(PROJECT_ROOT, item);
  if (!existsSync(src)) continue;
  const dst = resolve(stage, item);
  cpSync(src, dst, { recursive: true });
}
log(`[package] [1/5] 已复制项目代码`);

// 复制 node_modules(忽略一些大目录)
const nmSrc = resolve(PROJECT_ROOT, 'node_modules');
const nmDst = resolve(stage, 'node_modules');
const skipNm = new Set(['.cache', '.bin']);
function copyNm(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const name of readdirSync(src)) {
    if (skipNm.has(name)) continue;
    const sp = resolve(src, name);
    const dp = resolve(dst, name);
    const st = statSync(sp);
    if (st.isDirectory()) copyNm(sp, dp);
    else copyFileSync(sp, dp);
  }
}
copyNm(nmSrc, nmDst);
log(`[package] [2/5] 已复制 node_modules(含 duckdb native binary)`);

// 应用 dist-template 覆盖
copyFileSync(resolve(TPL, '.env'), resolve(stage, '.env'));
copyFileSync(resolve(TPL, 'update.bat'), resolve(stage, 'update.bat'));
copyFileSync(resolve(TPL, 'README-colleague.md'), resolve(stage, 'README.md'));
log(`[package] [3/5] 已应用同事专用模板(.env / update.bat / README.md)`);

// 创建 logs 目录占位(避免首次运行 mkdir 失败)
mkdirSync(resolve(stage, 'logs'), { recursive: true });
mkdirSync(resolve(stage, 'data'), { recursive: true }); // 占位,DATA_BASE 实际指向 SMB

// 写一个 VERSION 文件
import('node:fs').then(({ writeFileSync }) => {
  writeFileSync(
    resolve(stage, 'VERSION.txt'),
    `chexian-query ${version}\n打包时间: ${today.toISOString()}\n打包机: ${process.env.COMPUTERNAME || 'unknown'}\n`,
    'utf-8',
  );
});

log(`[package] [4/5] 已写 VERSION.txt`);

// ===== 7. 压缩 =====
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, zipName);
if (existsSync(outPath)) rmSync(outPath, { force: true });

log(`[package] [5/5] 压缩中...(可能需要 1-2 分钟)`);
const psCmd = `Compress-Archive -Path '${stage}' -DestinationPath '${outPath}' -Force`;
const r = spawnSync('powershell', ['-NoProfile', '-Command', psCmd], { stdio: 'inherit' });
if (r.status !== 0) fail('压缩失败');

// 清理 staging
rmSync(staging, { recursive: true, force: true });

const sizeMB = (statSync(outPath).size / 1024 / 1024).toFixed(1);
log(``);
log(`============================================================`, 'green');
log(`✅ 打包完成`, 'green');
log(`   文件: ${outPath}`, 'green');
log(`   大小: ${sizeMB} MB`, 'green');
log(`   版本: ${version}`, 'green');
log(``);
log(`下一步:`, 'blue');
log(`   1. 把 zip 放到 \\\\10.120.0.87\\chexian-query\\release\\`);
log(`   2. 群里通知同事:"新版 ${version},下载到 D:\\ 后双击 D:\\chexian-query\\update.bat"`);
log(`============================================================`, 'green');
