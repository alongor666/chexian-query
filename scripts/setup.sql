-- chexian-query VIEW 定义层
-- 由 query.mjs / verify.mjs 启动时自动加载
-- 让 AI 看到的是逻辑表(policy_all 等),不感知分片

------------------------------------------------------------
-- 1. 事实表(fact)
------------------------------------------------------------

-- 保单事实表(分片:全量 21-23 / 剔摩 24+ / 限摩 24+)
CREATE OR REPLACE VIEW policy_all AS
  SELECT * FROM read_parquet('data/policy/current/*.parquet', union_by_name=true);

-- 赔案事实表(按年分区:claims_2019 ~ claims_2026)
CREATE OR REPLACE VIEW claims_all AS
  SELECT * FROM read_parquet('data/claims/claims_*.parquet', union_by_name=true);

-- 报价事实表
CREATE OR REPLACE VIEW quotes_all AS
  SELECT * FROM read_parquet('data/quotes/latest.parquet');

-- 交叉销售(驾意险)事实表
CREATE OR REPLACE VIEW cross_sell_all AS
  SELECT * FROM read_parquet('data/cross_sell/latest.parquet');

-- 续保跟踪事实表
CREATE OR REPLACE VIEW renewal_all AS
  SELECT * FROM read_parquet('data/renewal/latest.parquet');

-- 客户来源去向事实表
CREATE OR REPLACE VIEW customer_flow_all AS
  SELECT * FROM read_parquet('data/customer_flow/latest.parquet');

------------------------------------------------------------
-- 2. 维度表(dim)
------------------------------------------------------------

-- 业务员维度(归属机构 / 团队 / 计划)
CREATE OR REPLACE VIEW dim_salesman AS
  SELECT * FROM read_parquet('data/dim/salesman/*.parquet', union_by_name=true);

-- 计划维度(分公司 / 三级 / 团队 / 业务员级别)
CREATE OR REPLACE VIEW dim_plan AS
  SELECT * FROM read_parquet('data/dim/plan/*.parquet', union_by_name=true);

-- 品牌维度(厂牌车型 → 品牌归一,37752 条)
CREATE OR REPLACE VIEW dim_brand AS
  SELECT * FROM read_parquet('data/dim/brand/*.parquet', union_by_name=true);

-- 维修资源维度(4S 店 / 修理厂)
CREATE OR REPLACE VIEW dim_repair AS
  SELECT * FROM read_parquet('data/dim/repair/*.parquet', union_by_name=true);

-- 车牌归属地维度
CREATE OR REPLACE VIEW dim_plate_region AS
  SELECT * FROM read_parquet('data/dim/plate_region/*.parquet', union_by_name=true);
