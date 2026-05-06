#!/usr/bin/env node
/**
 * chexian-query 数据自检
 *
 * 用法: node scripts/verify.mjs
 *
 * 检查项:
 *   1. .env 配置的 DATA_BASE 是否可达
 *   2. 各 VIEW 是否可读 + 行数
 *   3. policy 签单/起期日期范围
 *   4. 保费净额(SUM)+ 毛保费(ABS)
 *   5. 险类分布
 *   6. 客户类别分布(应为 11 类)
 *   7. claims 报案时间范围 + 已决/未决赔款
 */

import duckdb from 'duckdb';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadDotenv, buildSetupSQL, resolveDataBase } from './setup.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..');

function exec(conn, sql) {
  return new Promise((resolveP, rejectP) => {
    conn.all(sql, (err, rows) => (err ? rejectP(err) : resolveP(rows)));
  });
}

function fmt(n) {
  if (typeof n === 'bigint') n = Number(n);
  if (typeof n !== 'number') return String(n ?? '');
  if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(2) + ' 亿';
  if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(2) + ' 万';
  return n.toLocaleString('zh-CN');
}

function header(s) {
  console.log(`\n${'─'.repeat(60)}\n${s}\n${'─'.repeat(60)}`);
}

async function tryQuery(conn, label, sql) {
  try {
    const rows = await exec(conn, sql);
    return { ok: true, label, rows };
  } catch (e) {
    return { ok: false, label, error: e.message };
  }
}

async function main() {
  loadDotenv(PROJECT_ROOT);
  const dataBase = resolveDataBase(PROJECT_ROOT);
  process.chdir(PROJECT_ROOT);

  console.log(`\n[verify] DATA_BASE = ${dataBase}`);

  const db = new duckdb.Database(':memory:');
  const conn = db.connect();

  try {
    await exec(conn, buildSetupSQL(dataBase));
  } catch (e) {
    console.error(`[verify] VIEW 加载失败: ${e.message}`);
    console.error(`提示:确认 DATA_BASE 指向的目录存在,或参考 README.md 第 3 步配置 .env`);
    process.exit(1);
  }

  header('1. VIEW 行数');
  const views = [
    'policy_all',
    'claims_all',
    'quotes_all',
    'cross_sell_all',
    'renewal_all',
    'customer_flow_all',
    'dim_salesman',
    'dim_plan',
    'dim_brand',
    'dim_repair',
    'dim_plate_region',
  ];
  for (const v of views) {
    const r = await tryQuery(conn, v, `SELECT COUNT(*) AS n FROM ${v}`);
    if (r.ok) {
      console.log(`  ${v.padEnd(20)} ${fmt(r.rows[0].n)} 行`);
    } else {
      console.log(`  ${v.padEnd(20)} ⚠️ ${r.error.slice(0, 60)}`);
    }
  }

  header('2. policy 签单日期 / 起期范围');
  const r2 = await tryQuery(conn, 'policy_dates',
    `SELECT MIN(policy_date) AS min_sign, MAX(policy_date) AS max_sign,
            MIN(insurance_start_date) AS min_start, MAX(insurance_start_date) AS max_start
       FROM policy_all`);
  if (r2.ok) {
    console.log(`  签单日期: ${r2.rows[0].min_sign} ~ ${r2.rows[0].max_sign}`);
    console.log(`  保险起期: ${r2.rows[0].min_start} ~ ${r2.rows[0].max_start}`);
  } else {
    console.log(`  ⚠️ ${r2.error}`);
  }

  header('3. 保费净额 / 毛保费');
  const r3 = await tryQuery(conn, 'premium',
    `SELECT SUM(premium) AS net_premium, SUM(ABS(premium)) AS gross_premium FROM policy_all`);
  if (r3.ok) {
    console.log(`  净保费(SUM): ${fmt(r3.rows[0].net_premium)} 元`);
    console.log(`  毛保费(ABS): ${fmt(r3.rows[0].gross_premium)} 元`);
  } else {
    console.log(`  ⚠️ ${r3.error}`);
  }

  header('4. 险类分布');
  const r4 = await tryQuery(conn, 'insurance_type',
    `SELECT insurance_type, COUNT(*) AS rows, SUM(premium) AS premium
       FROM policy_all GROUP BY 1 ORDER BY 2 DESC`);
  if (r4.ok) {
    for (const row of r4.rows) {
      console.log(`  ${String(row.insurance_type).padEnd(10)} ${fmt(row.rows).padStart(12)} 行  ${fmt(row.premium).padStart(12)} 元`);
    }
  }

  header('5. 客户类别分布(应为 11 类)');
  const r5 = await tryQuery(conn, 'customer_category',
    `SELECT customer_category, COUNT(*) AS rows
       FROM policy_all GROUP BY 1 ORDER BY 2 DESC`);
  if (r5.ok) {
    for (const row of r5.rows) {
      console.log(`  ${String(row.customer_category ?? '(空)').padEnd(20)} ${fmt(row.rows).padStart(12)} 行`);
    }
    console.log(`  共 ${r5.rows.length} 类`);
  }

  header('6. claims 报案时间范围 + 赔款合计');
  const r6 = await tryQuery(conn, 'claims_dates',
    `SELECT MIN(report_time) AS min_d, MAX(report_time) AS max_d, COUNT(*) AS n,
            SUM(settled_amount) AS settled, SUM(pending_amount) AS pending
       FROM claims_all`);
  if (r6.ok) {
    console.log(`  报案时间: ${r6.rows[0].min_d} ~ ${r6.rows[0].max_d}`);
    console.log(`  赔案件数: ${fmt(r6.rows[0].n)}`);
    console.log(`  已决赔款: ${fmt(r6.rows[0].settled)} 元`);
    console.log(`  未决赔款: ${fmt(r6.rows[0].pending)} 元`);
  } else {
    console.log(`  ⚠️ ${r6.error.slice(0, 100)}`);
  }

  header('✅ 自检完成');
  process.exit(0);
}

main().catch((e) => {
  console.error(`[verify] 失败: ${e.stack || e.message}`);
  process.exit(1);
});
