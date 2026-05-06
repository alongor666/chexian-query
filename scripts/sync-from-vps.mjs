#!/usr/bin/env node
/**
 * sync-from-vps.mjs — 从 VPS 增量同步 parquet 到本地数据目录
 *
 * 仅供数据负责人在 Win 中转机上运行(同事不需要)。
 *
 * 用法:
 *   node scripts/sync-from-vps.mjs                # 增量同步
 *   node scripts/sync-from-vps.mjs --dry-run      # 仅打印待下载清单,不实际下载
 *   node scripts/sync-from-vps.mjs --full         # 全量同步(忽略本地已有文件)
 *   node scripts/sync-from-vps.mjs --check        # 仅检查 SSH 连通性
 *
 * 配置(在 .env 中):
 *   VPS_HOST=162.14.113.44
 *   VPS_USER=deployer
 *   VPS_PORT=22
 *   VPS_DATA_DIR=/var/www/chexian/server/data
 *   VPS_KEY_PATH=                  # 可选,留空走默认 ~/.ssh/id_*
 *   DATA_BASE=D:/chexian-share/data  # 中转机本地共享盘的物理路径
 *
 * 路径映射(VPS 远端 → 本地):
 *   server/data/current/*.parquet                   → data/policy/current/*.parquet
 *   server/data/fact/claims_detail/*.parquet        → data/claims/*.parquet
 *   server/data/fact/quotes_conversion/*.parquet    → data/quotes/*.parquet
 *   server/data/fact/cross_sell/*.parquet           → data/cross_sell/*.parquet
 *   server/data/fact/customer_flow/*.parquet        → data/customer_flow/*.parquet
 *   server/data/fact/renewal_tracker/*.parquet      → data/renewal/*.parquet
 *   server/data/dim/<sub>/*.parquet                 → data/dim/<sub>/*.parquet
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDotenv, resolveDataBase } from './setup.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

loadDotenv(PROJECT_ROOT);

const CFG = {
  host: process.env.VPS_HOST || '162.14.113.44',
  user: process.env.VPS_USER || 'deployer',
  port: Number(process.env.VPS_PORT || 22),
  remoteDir: (process.env.VPS_DATA_DIR || '/var/www/chexian/server/data').replace(/\/$/, ''),
  keyPath: process.env.VPS_KEY_PATH || null,
  localBase: resolveDataBase(PROJECT_ROOT),
};

// 路径映射:VPS 上相对于 VPS_DATA_DIR 的路径 → 本地相对于 DATA_BASE 的路径
const PATH_MAP = [
  { vps: 'current',                  local: 'policy/current' },
  { vps: 'fact/claims_detail',       local: 'claims' },
  { vps: 'fact/quotes_conversion',   local: 'quotes' },
  { vps: 'fact/cross_sell',          local: 'cross_sell' },
  { vps: 'fact/customer_flow',       local: 'customer_flow' },
  { vps: 'fact/renewal_tracker',     local: 'renewal' },
  { vps: 'dim/salesman',             local: 'dim/salesman' },
  { vps: 'dim/plan',                 local: 'dim/plan' },
  { vps: 'dim/brand',                local: 'dim/brand' },
  { vps: 'dim/repair',               local: 'dim/repair' },
  { vps: 'dim/plate_region',         local: 'dim/plate_region' },
];

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FULL = args.includes('--full');
const CHECK_ONLY = args.includes('--check');

function log(msg, color = '') {
  const colors = { green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', blue: '\x1b[34m', reset: '\x1b[0m' };
  if (color) {
    console.log(`${colors[color] || ''}${msg}${colors.reset}`);
  } else {
    console.log(msg);
  }
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function buildSshArgs(extra = []) {
  const a = [
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=accept-new',
    '-p', String(CFG.port),
  ];
  if (CFG.keyPath) a.push('-i', CFG.keyPath);
  a.push(`${CFG.user}@${CFG.host}`);
  a.push(...extra);
  return a;
}

function buildScpArgs(remotePath, localPath) {
  const a = [
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=accept-new',
    '-P', String(CFG.port),
    '-p', // 保留 mtime
  ];
  if (CFG.keyPath) a.push('-i', CFG.keyPath);
  a.push(`${CFG.user}@${CFG.host}:${remotePath}`);
  a.push(localPath);
  return a;
}

async function runSpawn(cmd, args, options = {}) {
  return new Promise((resolveP) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => { stdout += d.toString(); });
    p.stderr.on('data', (d) => { stderr += d.toString(); });
    p.on('close', (code) => resolveP({ code, stdout, stderr }));
    p.on('error', (e) => resolveP({ code: -1, stdout: '', stderr: e.message }));
  });
}

async function checkSSH() {
  log(`[sync] 测试 SSH 到 ${CFG.user}@${CFG.host}:${CFG.port} ...`, 'blue');
  const r = await runSpawn('ssh', buildSshArgs(['echo OK; hostname; pwd']));
  if (r.code !== 0) {
    log(`[sync] SSH 连接失败 (code=${r.code})`, 'red');
    log(r.stderr, 'red');
    log('排查建议:', 'yellow');
    log('  1. 检查 .env 里 VPS_HOST/VPS_USER/VPS_PORT/VPS_KEY_PATH', 'yellow');
    log('  2. 在终端手动跑 ssh 测试:', 'yellow');
    log(`     ssh -p ${CFG.port} ${CFG.user}@${CFG.host}`, 'yellow');
    log('  3. 确认中转机能联网到 VPS(防火墙/VPN)', 'yellow');
    return false;
  }
  log(`[sync] ✅ SSH OK:\n${r.stdout.trim()}`, 'green');
  return true;
}

async function listRemote() {
  // 用 find 列出每个路径下的所有 parquet,带 size + mtime
  const findCmd = PATH_MAP.map((m) => {
    const path = `${CFG.remoteDir}/${m.vps}`;
    // -L 跟随软链(以防 VPS 上是软链);忽略 .dup-archive / .backup-rebuild 等
    return `find -L "${path}" -name '.dup-archive*' -prune -o -name '.backup-rebuild*' -prune -o -type f -name '*.parquet' -printf '${m.local}|%P|%s|%T@\\n' 2>/dev/null`;
  }).join('; ');
  const r = await runSpawn('ssh', buildSshArgs([findCmd]));
  if (r.code !== 0) {
    log(`[sync] 远端列表失败: ${r.stderr}`, 'red');
    return null;
  }
  const lines = r.stdout.trim().split('\n').filter(Boolean);
  return lines.map((line) => {
    const [localBase, relPath, size, mtime] = line.split('|');
    return {
      remoteAbs: `${CFG.remoteDir}/${PATH_MAP.find((m) => m.local === localBase).vps}/${relPath}`,
      localRel: `${localBase}/${relPath}`,
      size: Number(size),
      mtime: Math.floor(Number(mtime)),
    };
  });
}

function localStat(localRel) {
  const abs = resolve(CFG.localBase, localRel.replace(/\//g, sep));
  if (!existsSync(abs)) return null;
  const s = statSync(abs);
  return { abs, size: s.size, mtime: Math.floor(s.mtimeMs / 1000) };
}

function planSync(remoteList) {
  const plan = [];
  for (const f of remoteList) {
    const local = localStat(f.localRel);
    if (FULL) {
      plan.push({ ...f, action: local ? 'UPDATE' : 'NEW' });
    } else if (!local) {
      plan.push({ ...f, action: 'NEW' });
    } else if (local.size !== f.size || Math.abs(local.mtime - f.mtime) > 2) {
      plan.push({ ...f, action: 'UPDATE' });
    }
  }
  return plan;
}

async function downloadOne(item, idx, total) {
  const localAbs = resolve(CFG.localBase, item.localRel.replace(/\//g, sep));
  mkdirSync(dirname(localAbs), { recursive: true });
  process.stdout.write(`[${idx}/${total}] ${item.localRel.padEnd(60)} ${fmtBytes(item.size).padStart(10)} ${item.action.padStart(7)} ... `);
  const r = await runSpawn('scp', buildScpArgs(item.remoteAbs, localAbs));
  if (r.code !== 0) {
    process.stdout.write('\x1b[31mFAIL\x1b[0m\n');
    log(`  错误: ${r.stderr.trim()}`, 'red');
    return false;
  }
  process.stdout.write('\x1b[32mOK\x1b[0m\n');
  return true;
}

async function main() {
  log(`\n[sync] chexian-query 数据同步`, 'blue');
  log(`[sync] VPS:        ${CFG.user}@${CFG.host}:${CFG.port}`);
  log(`[sync] 远端目录:    ${CFG.remoteDir}`);
  log(`[sync] 本地目录:    ${CFG.localBase}`);
  log(`[sync] 模式:        ${DRY_RUN ? 'DRY-RUN' : (FULL ? 'FULL' : 'INCREMENTAL')}\n`);

  // 检查 ssh/scp 是否可用
  const sshCheck = spawnSync('ssh', ['-V'], { stdio: 'pipe' });
  if (sshCheck.status === null) {
    log('[sync] 未找到 ssh 命令', 'red');
    log('Windows 解决:开启 OpenSSH 客户端(设置 → 应用 → 可选功能 → OpenSSH 客户端)', 'yellow');
    process.exit(1);
  }

  if (!(await checkSSH())) process.exit(1);
  if (CHECK_ONLY) process.exit(0);

  log(`\n[sync] 列出远端 parquet 清单...`);
  const remote = await listRemote();
  if (!remote) process.exit(1);
  log(`[sync] 远端文件: ${remote.length} 个,合计 ${fmtBytes(remote.reduce((a, f) => a + f.size, 0))}`);

  const plan = planSync(remote);
  if (plan.length === 0) {
    log(`\n[sync] ✅ 已是最新,无需下载`, 'green');
    process.exit(0);
  }

  const totalBytes = plan.reduce((a, f) => a + f.size, 0);
  log(`\n[sync] 待下载: ${plan.length} 个文件,${fmtBytes(totalBytes)}`);
  log(`  其中: ${plan.filter((p) => p.action === 'NEW').length} 新增 / ${plan.filter((p) => p.action === 'UPDATE').length} 更新\n`);

  if (DRY_RUN) {
    for (const [i, item] of plan.entries()) {
      log(`  [${i + 1}] ${item.action.padStart(7)} ${item.localRel} (${fmtBytes(item.size)})`);
    }
    log(`\n[sync] DRY-RUN 完成,未实际下载`, 'yellow');
    process.exit(0);
  }

  const t0 = Date.now();
  let ok = 0;
  let fail = 0;
  for (const [i, item] of plan.entries()) {
    const success = await downloadOne(item, i + 1, plan.length);
    if (success) ok++; else fail++;
  }
  const sec = ((Date.now() - t0) / 1000).toFixed(1);

  log(`\n[sync] ${fail === 0 ? '✅' : '⚠️'} 同步完成: ${ok} 成功 / ${fail} 失败,用时 ${sec}s`, fail === 0 ? 'green' : 'yellow');
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  log(`[sync] 未预期错误: ${e.stack || e.message}`, 'red');
  process.exit(1);
});
