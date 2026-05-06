#!/usr/bin/env node
/**
 * chexian-query SQL 执行器(Windows 友好)
 *
 * 用法:
 *   node scripts/query.mjs "SELECT COUNT(*) FROM policy_all"
 *   node scripts/query.mjs --file path/to/query.sql
 *   node scripts/query.mjs --json "SELECT ..."        # 输出 JSON 而非 CSV
 *
 * 输出:
 *   stdout — 查询结果(默认 CSV,可选 JSON)
 *   stderr — 进度/错误信息
 *
 * 数据根目录由 .env 中的 DATA_BASE 控制(默认 ./data)。
 * 详见 scripts/setup.mjs 顶部说明。
 */

import duckdb from 'duckdb';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadDotenv, buildSetupSQL, resolveDataBase } from './setup.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..');

function logErr(msg) {
  process.stderr.write(`[query] ${msg}\n`);
}

function parseArgs(argv) {
  const args = { sql: null, fromFile: null, format: 'csv', limit: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file' || a === '-f') {
      args.fromFile = argv[++i];
    } else if (a === '--json') {
      args.format = 'json';
    } else if (a === '--limit') {
      args.limit = Number(argv[++i]);
    } else if (a === '--help' || a === '-h') {
      args.help = true;
    } else if (!args.sql) {
      args.sql = a;
    }
  }
  return args;
}

function printHelp() {
  process.stderr.write(`
chexian-query — DuckDB SQL 执行器

用法:
  node scripts/query.mjs "<SQL>"            执行内联 SQL
  node scripts/query.mjs --file query.sql   从文件读 SQL
  node scripts/query.mjs --json "<SQL>"     输出 JSON
  node scripts/query.mjs --limit 100 "..."  限制结果行数

可用 VIEW(详见 docs/schema.md):
  policy_all       保单(逻辑合并 3 个分片)
  claims_all       赔案(按年分区合并)
  quotes_all       报价
  cross_sell_all   驾意险交叉销售
  renewal_all      续保跟踪
  customer_flow_all 客户来源去向
  dim_salesman / dim_plan / dim_brand / dim_repair / dim_plate_region

业务口径必读: docs/business-rules.md
`);
}

function toCSV(rows) {
  if (rows.length === 0) return '';
  const cols = Object.keys(rows[0]);
  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'bigint' ? v.toString() : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const head = cols.join(',');
  const body = rows.map((r) => cols.map((c) => escape(r[c])).join(',')).join('\n');
  return `${head}\n${body}\n`;
}

function toJSON(rows) {
  return JSON.stringify(
    rows,
    (_k, v) => (typeof v === 'bigint' ? v.toString() : v),
    2,
  );
}

async function exec(db, sql) {
  return new Promise((resolveP, rejectP) => {
    db.all(sql, (err, rows) => {
      if (err) rejectP(err);
      else resolveP(rows);
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  let sql = args.sql;
  if (args.fromFile) {
    sql = readFileSync(resolve(args.fromFile), 'utf-8');
  }
  if (!sql || !sql.trim()) {
    logErr('错误:未提供 SQL。运行 `node scripts/query.mjs --help` 查看用法');
    process.exit(2);
  }

  if (args.limit && !/limit\s+\d+/i.test(sql)) {
    sql = `SELECT * FROM (\n${sql}\n) _q LIMIT ${args.limit}`;
  }

  loadDotenv(PROJECT_ROOT);
  const dataBase = resolveDataBase(PROJECT_ROOT);
  process.chdir(PROJECT_ROOT);

  const db = new duckdb.Database(':memory:');
  const conn = db.connect();

  try {
    await exec(conn, buildSetupSQL(dataBase));
  } catch (e) {
    logErr(`VIEW 加载失败 (DATA_BASE=${dataBase}): ${e.message}`);
    logErr(`提示:确认数据目录存在,或在 .env 中设置 DATA_BASE 指向正确路径`);
    process.exit(3);
  }

  const t0 = Date.now();
  let rows;
  try {
    rows = await exec(conn, sql);
  } catch (e) {
    logErr(`SQL 执行失败: ${e.message}`);
    process.exit(4);
  }
  const ms = Date.now() - t0;
  logErr(`查询完成: ${rows.length} 行, ${ms} ms`);

  const out = args.format === 'json' ? toJSON(rows) : toCSV(rows);
  process.stdout.write(out);
  process.exit(0);
}

main().catch((e) => {
  logErr(`未预期错误: ${e.stack || e.message}`);
  process.exit(1);
});
