# 例 3:商车自主定价系数档位 × 满期赔付率

## 业务问题
"想看下我们商车自主定价系数低于 0.85 的客户,实际赔付率是不是真的更低?定价是否有效?"

## 思考
- **维度**:`commercial_pricing_factor` 分档(0.5-0.7 / 0.7-0.85 / 0.85-1.0 / 1.0-1.15 / 1.15-1.3 / 1.3-1.5)
- **筛选**:仅商业险(`coverage_combination IN ('主全','交三')`),NCD 仅商业有值
- **指标**:满期赔付率
- **铁律**:NCD < 1 = 优质客户(连续无赔款),如果定价有效,赔付率应该随系数单调上升

## SQL

```sql
WITH p AS (
  SELECT
    policy_no,
    CASE
      WHEN commercial_pricing_factor < 0.70 THEN '01_深折(<0.70)'
      WHEN commercial_pricing_factor < 0.85 THEN '02_优折(0.70-0.85)'
      WHEN commercial_pricing_factor < 1.00 THEN '03_轻折(0.85-1.00)'
      WHEN commercial_pricing_factor = 1.00 THEN '04_基准(=1.00)'
      WHEN commercial_pricing_factor < 1.15 THEN '05_轻浮(1.00-1.15)'
      WHEN commercial_pricing_factor < 1.30 THEN '06_中浮(1.15-1.30)'
      ELSE                                       '07_高浮(>=1.30)'
    END AS ncd_bucket,
    SUM(premium) AS net_premium,
    SUM(premium * LEAST(1, GREATEST(0,
      date_diff('day', insurance_start_date, LEAST(CURRENT_DATE, insurance_end_date)) / 365.25
    ))) AS earned_premium
  FROM policy_all
  WHERE coverage_combination IN ('主全', '交三')
    AND commercial_pricing_factor IS NOT NULL
    AND policy_date >= DATE '2024-01-01'
  GROUP BY policy_no, commercial_pricing_factor, insurance_start_date, insurance_end_date
),
c AS (
  SELECT policy_no, SUM(settled_amount) AS paid, SUM(pending_amount) AS outstanding
  FROM claims_all GROUP BY policy_no
)
SELECT
  p.ncd_bucket                                            AS NCD档位,
  COUNT(DISTINCT p.policy_no)                             AS 保单数,
  ROUND(SUM(p.earned_premium) / 10000, 1)                 AS 满期保费_万元,
  ROUND(COALESCE(SUM(c.paid + c.outstanding), 0)/10000,1) AS 已发生赔款_万元,
  ROUND(
    COALESCE(SUM(c.paid + c.outstanding), 0) / NULLIF(SUM(p.earned_premium), 0) * 100,
  2) AS 满期赔付率_pct
FROM p
LEFT JOIN c USING (policy_no)
GROUP BY p.ncd_bucket
ORDER BY p.ncd_bucket;
```

## 预期输出(示意)

| NCD档位 | 保单数 | 满期保费_万元 | 已发生赔款_万元 | 满期赔付率_pct |
|---|---|---|---|---|
| 01_深折(<0.70) | 28,431 | 5,820.3 | 3,489.1 | 59.95 |
| 02_优折(0.70-0.85) | 51,283 | 9,034.7 | 5,890.3 | 65.20 |
| 03_轻折(0.85-1.00) | 38,932 | 7,011.5 | 5,234.8 | 74.66 |
| 04_基准(=1.00) | 12,089 | 2,083.4 | 1,732.1 | 83.14 |
| 05_轻浮(1.00-1.15) | 9,832 | 1,890.3 | 1,673.5 | 88.53 |
| 06_中浮(1.15-1.30) | 3,201 | 712.8 | 720.4 | 101.06 |
| 07_高浮(>=1.30) | 891 | 234.9 | 312.7 | 133.12 |

## 业务解读模板

> "定价**单调有效**:深折客户赔付率 59.95%,而高浮客户达 133%,差异 73 个百分点。
> 但 06 中浮和 07 高浮档已低于安全线(>100%),需要核查这部分客户的核保门槛——
> 是不是有些 1.15-1.30 的客户实际应该被拒保。"

## 涉及业务铁律
- 第 4 条(NCD 含义与范围)
- 第 5 条(NCD 仅适用商业险)
- 第 7 条(policy 必去重)
