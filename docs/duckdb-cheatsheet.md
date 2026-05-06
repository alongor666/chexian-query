# DuckDB 方言速查(避坑)

> AI 写 SQL 时容易把 PostgreSQL/MySQL 语法套进来,DuckDB 部分不兼容。

## 一、日期函数

```sql
-- 日期截断
date_trunc('month', policy_date)      -- ✅ 月初
date_trunc('week', policy_date)       -- ✅ 周一
date_trunc('quarter', policy_date)    -- ✅ 季度初

-- 日期差
date_diff('day',  start_d, end_d)     -- ✅ 天数差
date_diff('month', start_d, end_d)    -- ✅ 月数差
date_diff('year', start_d, end_d)     -- ✅ 年数差

-- 当前日期/时间
CURRENT_DATE                          -- ✅
NOW()                                 -- ✅ 时间戳
TODAY()                               -- ❌ 不存在,用 CURRENT_DATE

-- 日期加减
policy_date + INTERVAL 30 DAY         -- ✅
policy_date - INTERVAL 1 MONTH        -- ✅
DATE_ADD(d, INTERVAL 1 DAY)           -- ❌ 不支持

-- 提取年月
YEAR(policy_date), MONTH(policy_date)
extract(year FROM policy_date)        -- ✅ 二者等价
strftime(policy_date, '%Y-%m')        -- ✅ 格式化

-- 字符串转日期
CAST('2025-01-01' AS DATE)            -- ✅
DATE '2025-01-01'                     -- ✅ 字面量
strptime('2025-01-01', '%Y-%m-%d')    -- ✅ 显式解析
```

## 二、字符串函数

```sql
-- 拼接
'a' || 'b'                            -- ✅
CONCAT('a', 'b')                      -- ✅
'a' + 'b'                             -- ❌

-- 截取
SUBSTRING(plate_no, 1, 2)             -- ✅
SUBSTR(plate_no, 1, 2)                -- ✅ 别名
LEFT(plate_no, 2), RIGHT(plate_no, 4) -- ✅

-- 包含 / 模糊匹配
str LIKE '0110%'                      -- ✅ 前缀
CONTAINS(str, '电销')                 -- ✅
str ~ '^010[16]$'                     -- ✅ 正则
REGEXP_MATCHES(str, '^A[0-6]$')       -- ✅

-- 替换
REPLACE(str, '川A', '川B')            -- ✅
REGEXP_REPLACE(str, '\\d+', 'X')      -- ✅

-- 大小写
UPPER(str), LOWER(str)                -- ✅
```

## 三、聚合 / 窗口函数

```sql
-- 标准聚合
SUM, COUNT, AVG, MIN, MAX             -- ✅
COUNT(DISTINCT col)                   -- ✅

-- 条件聚合(推荐用 FILTER 子句,可读性高)
SUM(premium) FILTER (WHERE customer_category = '摩托车') AS moto_premium  -- ✅
SUM(CASE WHEN customer_category = '摩托车' THEN premium ELSE 0 END)       -- ✅ 也可

-- 窗口
SUM(premium) OVER (PARTITION BY org_level_3)                              -- ✅
ROW_NUMBER() OVER (PARTITION BY salesman_name ORDER BY premium DESC)      -- ✅
LAG(premium, 1) OVER (ORDER BY policy_date)                               -- ✅
LEAD(premium, 1) OVER (ORDER BY policy_date)                              -- ✅

-- 百分位
QUANTILE_CONT(reported_claims, 0.95)  -- ✅ 连续插值
PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY reported_claims)  -- ✅ 标准 SQL
```

## 四、分组高级用法

```sql
-- 分组多个维度
GROUP BY 1, 2                         -- ✅ 按 SELECT 位置
GROUP BY ALL                          -- ✅ 自动推断非聚合列
GROUP BY ROLLUP(org_level_3, customer_category)   -- ✅ 含小计
GROUP BY GROUPING SETS ((a), (b), (a,b), ())      -- ✅
GROUP BY CUBE(a, b)                   -- ✅

-- HAVING
HAVING SUM(premium) > 100000          -- ✅
QUALIFY ROW_NUMBER() OVER(...) <= 30  -- ✅ 窗口函数后筛选(代替子查询)
```

## 五、CTE / 子查询

```sql
-- 多 CTE
WITH t1 AS (...), t2 AS (...)
SELECT * FROM t1 JOIN t2 USING (policy_no)        -- ✅

-- 递归 CTE
WITH RECURSIVE t AS (...)             -- ✅

-- 横向子查询(LATERAL)
SELECT * FROM policy_all p, LATERAL (...) sub     -- ✅
```

## 六、Parquet / 文件读取

```sql
-- 单文件
SELECT * FROM 'data/policy/current/01_全量.parquet'
SELECT * FROM read_parquet('path.parquet')

-- 通配符 + Schema 合并
SELECT * FROM read_parquet('data/policy/current/*.parquet', union_by_name=true)

-- 描述 schema(查字段)
DESCRIBE policy_all
SHOW TABLES                           -- 列出当前 VIEW
SUMMARIZE policy_all                  -- ✅ 各字段统计描述
```

## 七、类型 / NULL 处理

```sql
-- NULL 处理
COALESCE(claims_paid, 0)              -- ✅
NULLIF(divisor, 0)                    -- ✅ 防除零
IFNULL(a, 0)                          -- ✅ 别名

-- 类型转换
CAST(premium AS INTEGER)              -- ✅
premium::INTEGER                      -- ✅ 简写
TRY_CAST('xxx' AS INTEGER)            -- ✅ 失败返回 NULL,不报错

-- 布尔判断
WHERE is_renewal                      -- ✅
WHERE is_renewal = TRUE               -- ✅
WHERE is_renewal IS TRUE              -- ✅
WHERE is_renewal IS NOT NULL          -- ✅
```

## 八、ORDER BY / LIMIT

```sql
ORDER BY premium DESC NULLS LAST      -- ✅
ORDER BY 2 DESC                       -- ✅ 按位置
LIMIT 10                              -- ✅
LIMIT 10 OFFSET 20                    -- ✅
TABLESAMPLE 1%                        -- ✅ 抽样,大表探查用
```

## 九、本项目易错点

### 错 1:用 `DATE_FORMAT` 代替 `strftime`
```sql
-- ❌ MySQL 风格,DuckDB 不支持
DATE_FORMAT(policy_date, '%Y-%m')

-- ✅ DuckDB 风格
strftime(policy_date, '%Y-%m')
```

### 错 2:把 BOOL 当字符串过滤
```sql
-- ❌
WHERE is_renewal = 'True'

-- ✅(BOOL 直接用)
WHERE is_renewal
WHERE is_renewal = TRUE
```

### 错 3:JOIN 后保费乘倍
```sql
-- ❌ policy_no 在 policy_all 中可能多行(批改副本)
SELECT SUM(c.claims_paid)
FROM policy_all p JOIN claims_all c USING (policy_no)

-- ✅ 先去重再 JOIN
WITH p AS (SELECT policy_no, SUM(premium) prem FROM policy_all GROUP BY 1)
SELECT SUM(c.claims_paid) FROM p LEFT JOIN claims_all c USING (policy_no)
```

### 错 4:满期比率不裁剪
```sql
-- ❌ 可能 > 1 或 < 0
date_diff('day', insurance_start_date, CURRENT_DATE) / 365.25 AS earned_ratio

-- ✅
LEAST(1, GREATEST(0,
  date_diff('day', insurance_start_date, LEAST(CURRENT_DATE, insurance_end_date)) / 365.25
))
```

### 错 5:DuckDB 不支持参数化的 CREATE VIEW(VIEW 内不能用 ?)
- 写报表时若需"上月":在 SQL 字面量里直接计算 `date_trunc('month', CURRENT_DATE) - INTERVAL 1 MONTH`,不要用占位符

### 错 6:聚合时漏掉小客户类别
```sql
-- ❌ 只显示前几大,小类别被吞
SELECT customer_category, SUM(premium) FROM policy_all GROUP BY 1 LIMIT 5

-- ✅(11 类不多,直接全显示)
SELECT customer_category, SUM(premium) AS prem
FROM policy_all GROUP BY 1 ORDER BY 2 DESC
```

## 十、常用模板速查

```sql
-- 月度趋势
SELECT date_trunc('month', policy_date) AS m, SUM(premium) AS p
FROM policy_all GROUP BY 1 ORDER BY 1;

-- Top N + 其他
WITH ranked AS (
  SELECT salesman_name, SUM(premium) AS p,
         ROW_NUMBER() OVER (ORDER BY SUM(premium) DESC) AS rn
  FROM policy_all GROUP BY 1
)
SELECT CASE WHEN rn <= 30 THEN salesman_name ELSE '其他' END AS name,
       SUM(p) AS premium
FROM ranked GROUP BY 1 ORDER BY 2 DESC;

-- 同比 / 环比
SELECT m,
       p,
       p - LAG(p, 1) OVER (ORDER BY m) AS mom_diff,
       p / LAG(p, 1) OVER (ORDER BY m) - 1 AS mom_rate,
       p / LAG(p, 12) OVER (ORDER BY m) - 1 AS yoy_rate
FROM (SELECT date_trunc('month', policy_date) m, SUM(premium) p
      FROM policy_all GROUP BY 1);

-- 双口径对账(机构 × 客户类别)
SELECT GROUPING(org_level_3) AS g_org, GROUPING(customer_category) AS g_cat,
       org_level_3, customer_category, SUM(premium)
FROM policy_all
GROUP BY GROUPING SETS (
  (org_level_3, customer_category),
  (org_level_3),
  (customer_category),
  ()
);
```
