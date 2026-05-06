#!/usr/bin/env node
/**
 * sync-https.mjs — 通过 HTTPS 从 VPS 拉 parquet 到本地
 *
 * 适用场景:Win 中转机被公司防火墙限制无法 SSH,只能走 V2RayN 代理 HTTPS。
 * 取代 sync-from-vps.mjs(后者依赖 SSH/SCP)。
 *
 * 用法:
 *   node scripts/sync-https.mjs                # 增量同步
 *   node scripts/sync-https.mjs --dry-run      # 仅打印待下载清单
 *   node scripts/sync-https.mjs --full         # 全量同步(忽略本地)
 *   node scripts/sync-https.mjs --check        # 仅检查 HTTPS 连通
 *
 * 配置(在 .env 中):
 *   DATA_BASE=D:/chexian-share/data
 *   HTTPS_BASE_URL=https://chexian.cretvalu.com/data/
 *   HTTPS_USER=chexian-data
 *   HTTPS_PASS=<在 VPS 上跑 setup-https-share.sh 后获得>
 *
 * 路径映射:与 sync-from-vps.mjs 一致。
 */

import { existsSync, mkdirSync, statSync, createWriteStream, renameSync, unlinkSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from 'node:https';
import { loadDotenv, resolveDataBase } from './setup.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

loadDotenv(PROJECT_ROOT);

const CFG = {
  baseUrl: (process.env.HTTPS_BASE_URL || 'https://chexian.cretvalu.com/data/').replace(/\/?$/, '/'),
  user: process.env.HTTPS_USER || 'chexian-data',
  pass: process.env.HTTPS_PASS,
  localBase: resolveDataBase(PROJECT_ROOT),
};

if (!CFG.pass) {
  console.error('\x1b[31m错误:.env 中未设置 HTTPS_PASS\x1b[0m');
  console.error('请在 VPS 上运行 scripts/setup-https-share.sh 获得密码后填入 .env');
  process.exit(1);
}

const AUTH = 'Basic ' + Buffer.from(`${CFG.user}:${CFG.pass}`).toString('base64');

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
  console.log(color ? `${colors[color]}${msg}${colors.reset}` : msg);
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function httpsRequest(url) {
  return new Promise((resolveP, rejectP) => {
    const u = new URL(url);
    const req = request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'GET',
      headers: { Authorization: AUTH, 'User-Agent': 'chexian-sync-https/1.0' },
      timeout: 30000,
    }, resolveP);
    req.on('error', rejectP);
    req.on('timeout', () => { req.destroy(new Error('Request timeout')); });
    req.end();
  });
}

async function fetchJson(url) {
  const res = await httpsRequest(url);
  let body = '';
  for await (const chunk of res) body += chunk;
  if (res.statusCode !== 200) {
    throw new Error(`HTTP ${res.statusCode} ${res.statusMessage}: ${body.slice(0, 200)}`);
  }
  return JSON.parse(body);
}

async function listRemoteRecursive(vpsPath, localBase, results) {
  const url = CFG.baseUrl + vpsPath + (vpsPath.endsWith('/') ? '' : '/');
  let entries;
  try {
    entries = await fetchJson(url);
  } catch (e) {
    log(`  跳过 ${vpsPath}: ${e.message}`, 'yellow');
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const subVps = `${vpsPath}/${e.name}`;
    if (e.type === 'directory') {
      await listRemoteRecursive(subVps, localBase, results);
    } else if (e.name.endsWith('.parquet')) {
      const subRel = subVps.slice(vpsPath.length + 1);
      results.push({
        url: CFG.baseUrl + subVps,
        localRel: `${localBase}/${subRel}`,
        size: e.size,
        mtime: Math.floor(new Date(e.mtime).getTime() / 1000),
      });
    }
  }
}

async function listAllRemote() {
  const all = [];
  for (const m of PATH_MAP) {
    await listRemoteRecursive(m.vps, m.local, all);
  }
  return all;
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
    } else if (local.size !== f.size) {
      plan.push({ ...f, action: 'UPDATE' });
    }
  }
  return plan;
}

async function downloadOne(item, idx, total) {
  const localAbs = resolve(CFG.localBase, item.localRel.replace(/\//g, sep));
  mkdirSync(dirname(localAbs), { recursive: true });
  const tmpPath = localAbs + '.tmp';
  process.stdout.write(`[${idx}/${total}] ${item.localRel.padEnd(60)} ${fmtBytes(item.size).padStart(10)} ${item.action.padStart(7)} ... `);

  let res;
  try {
    res = await httpsRequest(item.url);
  } catch (e) {
    process.stdout.write('\x1b[31mFAIL\x1b[0m\n');
    log(`  网络错误: ${e.message}`, 'red');
    return false;
  }

  if (res.statusCode !== 200) {
    process.stdout.write('\x1b[31mFAIL\x1b[0m\n');
    log(`  HTTP ${res.statusCode} ${res.statusMessage}`, 'red');
    return false;
  }

  try {
    await new Promise((resolveP, rejectP) => {
      const out = createWriteStream(tmpPath);
      res.pipe(out);
      out.on('finish', resolveP);
      out.on('error', rejectP);
      res.on('error', rejectP);
    });
    if (existsSync(localAbs)) unlinkSync(localAbs);
    renameSync(tmpPath, localAbs);
  } catch (e) {
    process.stdout.write('\x1b[31mFAIL\x1b[0m\n');
    log(`  写入失败: ${e.message}`, 'red');
    if (existsSync(tmpPath)) unlinkSync(tmpPath);
    return false;
  }

  process.stdout.write('\x1b[32mOK\x1b[0m\n');
  return true;
}

async function checkConn() {
  log(`[sync] 测试 HTTPS 连接 ${CFG.baseUrl} ...`, 'blue');
  try {
    const res = await httpsRequest(CFG.baseUrl);
    if (res.statusCode === 401) {
      log('[sync] HTTPS 通,但账号或密码错误', 'red');
      return false;
    }
    if (res.statusCode !== 200) {
      log(`[sync] HTTPS 返回 ${res.statusCode} ${res.statusMessage}`, 'red');
      return false;
    }
    log('[sync] ✅ HTTPS 连接正常', 'green');
    return true;
  } catch (e) {
    log(`[sync] HTTPS 连接失败: ${e.message}`, 'red');
    log('排查:', 'yellow');
    log('  1. V2RayN 是否运行?', 'yellow');
    log('  2. V2RayN 路由是否让 chexian.cretvalu.com 走代理?(GLOBAL 模式 或 自定义规则)', 'yellow');
    log('  3. .env 里的 HTTPS_BASE_URL/USER/PASS 是否正确?', 'yellow');
    return false;
  }
}

async function main() {
  log(`\n[sync] chexian-query HTTPS 数据同步`, 'blue');
  log(`[sync] URL:       ${CFG.baseUrl}`);
  log(`[sync] 用户:       ${CFG.user}`);
  log(`[sync] 本地目录:   ${CFG.localBase}`);
  log(`[sync] 模式:       ${DRY_RUN ? 'DRY-RUN' : (FULL ? 'FULL' : 'INCREMENTAL')}\n`);

  if (!(await checkConn())) process.exit(1);
  if (CHECK_ONLY) process.exit(0);

  log(`\n[sync] 列出远端清单...`);
  const remote = await listAllRemote();
  log(`[sync] 远端: ${remote.length} 个文件,合计 ${fmtBytes(remote.reduce((a, f) => a + f.size, 0))}`);

  const plan = planSync(remote);
  if (plan.length === 0) {
    log(`\n[sync] ✅ 已是最新,无需下载`, 'green');
    process.exit(0);
  }

  log(`\n[sync] 待下载: ${plan.length} 个,${fmtBytes(plan.reduce((a, f) => a + f.size, 0))}`);
  log(`  ${plan.filter((p) => p.action === 'NEW').length} 新增 / ${plan.filter((p) => p.action === 'UPDATE').length} 更新\n`);

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

  log(`\n[sync] ${fail === 0 ? '✅' : '⚠️'} ${ok} 成功 / ${fail} 失败,用时 ${sec}s`, fail === 0 ? 'green' : 'yellow');
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  log(`[sync] 未预期错误: ${e.stack || e.message}`, 'red');
  process.exit(1);
});
