/**
 * setup.mjs — 共享的 VIEW 定义生成器
 *
 * 根据 DATA_BASE 环境变量(或默认 ./data)动态生成 setup.sql,
 * 由 query.mjs / verify.mjs 启动时调用。
 *
 * DATA_BASE 支持的格式:
 *   - 相对路径(默认): ./data
 *   - 绝对路径:        D:/datasets/chexian (Windows) 或 /Users/foo/data (macOS)
 *   - UNC 网络共享:    \\10.120.0.87\chexian-query\data (Windows SMB)
 *                     //10.120.0.87/chexian-query/data (跨平台兼容写法,推荐)
 *
 * 同事配置方法:在项目根创建 .env 文件,内容例如:
 *   DATA_BASE=//10.120.0.87/chexian-query/data
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 读项目根的 .env 文件,把里面的 KEY=VALUE 注入 process.env
 * 不依赖 dotenv 库,保持零依赖
 */
export function loadDotenv(projectRoot) {
  const envPath = resolve(projectRoot, '.env');
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, 'utf-8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    // 去掉首尾引号
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
}

/**
 * 规范化路径:把 Windows 反斜杠统一成正斜杠(DuckDB 跨平台兼容),去掉末尾斜杠
 */
function normalizeBase(raw) {
  // \\10.120.0.87\share → //10.120.0.87/share
  // D:\data → D:/data
  let b = raw.replace(/\\/g, '/');
  if (b.endsWith('/')) b = b.slice(0, -1);
  return b;
}

/**
 * 生成 setup SQL(包含全部 VIEW 定义)
 */
export function buildSetupSQL(dataBase) {
  const b = normalizeBase(dataBase);
  return `
------------------------------------------------------------
-- 自动生成,数据根目录: ${b}
-- 修改请改 scripts/setup.mjs::buildSetupSQL,不要直接编辑
------------------------------------------------------------

-- 1. 事实表(fact)
CREATE OR REPLACE VIEW policy_all AS
  SELECT * FROM read_parquet('${b}/policy/current/*.parquet', union_by_name=true);

CREATE OR REPLACE VIEW claims_all AS
  SELECT * FROM read_parquet('${b}/claims/claims_*.parquet', union_by_name=true);

CREATE OR REPLACE VIEW quotes_all AS
  SELECT * FROM read_parquet('${b}/quotes/latest.parquet');

CREATE OR REPLACE VIEW cross_sell_all AS
  SELECT * FROM read_parquet('${b}/cross_sell/latest.parquet');

CREATE OR REPLACE VIEW renewal_all AS
  SELECT * FROM read_parquet('${b}/renewal/latest.parquet');

CREATE OR REPLACE VIEW customer_flow_all AS
  SELECT * FROM read_parquet('${b}/customer_flow/latest.parquet');

-- 2. 维度表(dim)
CREATE OR REPLACE VIEW dim_salesman AS
  SELECT * FROM read_parquet('${b}/dim/salesman/*.parquet', union_by_name=true);

CREATE OR REPLACE VIEW dim_plan AS
  SELECT * FROM read_parquet('${b}/dim/plan/*.parquet', union_by_name=true);

CREATE OR REPLACE VIEW dim_brand AS
  SELECT * FROM read_parquet('${b}/dim/brand/*.parquet', union_by_name=true);

CREATE OR REPLACE VIEW dim_repair AS
  SELECT * FROM read_parquet('${b}/dim/repair/*.parquet', union_by_name=true);

CREATE OR REPLACE VIEW dim_plate_region AS
  SELECT * FROM read_parquet('${b}/dim/plate_region/*.parquet', union_by_name=true);
`;
}

/**
 * 解析 DATA_BASE,默认 './data'(项目根下的 data 子目录)
 */
export function resolveDataBase(projectRoot) {
  const raw = process.env.DATA_BASE && process.env.DATA_BASE.trim();
  if (!raw) {
    return resolve(projectRoot, 'data');
  }
  return raw;
}
