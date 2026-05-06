# Schema — 字段与 VIEW 速查

> 数据源:`data/policy/current/*.parquet`(分片)等。本文件描述 VIEW 抽象后的字段。

## VIEW 总览

| VIEW | 行数(参考) | 主键 | 业务用途 |
|---|---|---|---|
| `policy_all` | ~600k | (policy_no, insurance_type, endorsement_no) | 保单/批改记录,业绩+赔付分析 |
| `claims_all` | ~70k | claim_no | 赔案明细,理赔分析 |
| `quotes_all` | 动态 | (quote_no, quote_time) | 报价转化 |
| `cross_sell_all` | 动态 | (policy_no, cross_sell_type) | 驾意险渗透 |
| `renewal_all` | 动态 | policy_no | 续保跟踪 |
| `customer_flow_all` | 动态 | (期间, vin) | 客户来源去向 |
| `dim_salesman` | ~322 | salesman_name | 业务员归属 |
| `dim_plan` | 动态 | (期间, 维度) | 计划目标 |
| `dim_brand` | ~37k | vehicle_model | 车型 → 品牌归一 |
| `dim_repair` | 动态 | repair_id | 4S/修理厂 |
| `dim_plate_region` | ~31 | plate_prefix | 车牌归属省市 |

## policy_all 字段(主表,42 字段)

### A. 主键 / 关联键
| id(英文列) | label(中文) | 类型 | 说明 |
|---|---|---|---|
| `policy_no` | 保单号 | VARCHAR | 22 位数字。**年度内可重复**(原单+批改副本),JOIN 必去重 |
| `renewal_policy_no` | 续保单号 | VARCHAR | 上一年保单号;非空=续保 |
| `endorsement_no` | 批单号 | VARCHAR | 格式 `保单号-001`;非空=批改记录 |
| `vehicle_frame_no` | 车架号 | VARCHAR | 17 位 VIN,**敏感字段** |
| `plate_no` | 车牌号码 | VARCHAR | 完整车牌;归属地用 `SUBSTRING(plate_no,1,2)` |

### B. 日期
| id | label | 类型 | 说明 |
|---|---|---|---|
| `policy_date` | 签单日期 | DATE | 业绩归属日期 |
| `underwriting_date` | 提核日期 | DATE | 原签单日期 |
| `insurance_start_date` | 保险起期 | DATE | 业务量归属日期;**满期/出险率分母基准** |
| `insurance_end_date` | 保险止期 | DATE | 保险责任结束 |
| `first_registration_date` | 初次登记年月 | VARCHAR | 车辆登记年月 |

### C. 金额
| id | label | 类型 | 说明 |
|---|---|---|---|
| `premium` | 保费 | DOUBLE | **可正可负**(负=批改退费),用 `SUM` 取净 |
| `new_vehicle_price` | 新车购置价 | DOUBLE | 元;0 = 摩托/纯交强 |
| `commercial_pricing_factor` | 商车自主定价系数 | DOUBLE | 0.5-1.5,新能源上限 1.45;**仅商业险有值** |
| `reported_claims` | 已报告赔款 | DOUBLE | 元;空值填 0 |
| `claim_cases` | 赔案件数 | INTEGER | 整数;空值填 0 |
| `fee_amount` | 费用金额 | DOUBLE | 元;**注意**这是保单维度费用,非按月分摊 |
| `cross_sell_premium_driver` | 交叉销售保费_驾意 | DOUBLE | 驾意险保费 |
| `third_party_coverage` | 三者保额 | DOUBLE | 三者险保额 |
| `driver_coverage` | 司机保额 | DOUBLE | 司机座位保额 |
| `passenger_coverage` | 乘客险保额 | DOUBLE | 乘客座位保额 |

### D. 布尔(BOOL)
| id | label | 说明 |
|---|---|---|
| `is_renewal` | 是否续保 | True = 续保单号非空 |
| `is_renewable` | 是否可续 | False = 退保/过户禁续 |
| `is_new_car` | 是否新车 | True 占 5.4% |
| `is_nev` | 是否新能源 | True 占 3.4% |
| `is_transfer` | 是否过户车 | True 占 8.8% |
| `is_telemarketing` | 是否电销 | terminal_source 含 0110 |
| `is_quote` | 是否报价 | ⚠️ 口径不可靠,谨慎使用 |
| `is_cross_sell` | 交叉销售标识 | 是否搭售驾意险 |

### E. 分类型
| id | label | 说明 |
|---|---|---|
| `insurance_type` | 险类 | `交强险` / `商业保险` |
| `coverage_combination` | 险别组合 | `单交` / `交三` / `主全` / `其他` |
| `is_commercial_insure` | 是否交商统保 | `单交` / `套单` / `单商` / `其他` |
| `customer_category` | 客户类别 | 11 类(见 business-rules.md) |
| `org_level_3` | 三级机构 | 14 个机构,业绩归属维度 |
| `salesman_name` | 业务员 | 格式 `工号+姓名`,322 位 |
| `terminal_source` | 终端来源 | 4 位代码:0106 移动展业 / 0101 柜面 / 0110 融合销售… |
| `agent_name` | 经代名 | ⚠️ 不可靠,归因业务来源用 salesman_name + org_level_3 |
| `customer_source` | 客户源 | 客户来源渠道 |
| `vehicle_model` | 厂牌车型 | 23k+ 不同值,**不直接分组**,JOIN dim_brand |
| `tonnage_segment` | 吨位分段 | 1吨以下 / 1-2吨 / 2-9吨 / 9-10吨 / 10吨以上 |
| `tonnage_value` | 吨位数 | 数值,与 tonnage_segment 互补 |
| `truck_type` | 货车类型 | 货车细分 |
| `seat_count` | 座位数 | 整数 |
| `fuel_type` | 燃料种类 | 仅 2020-2023 有值 |
| `endorsement_type` | 批改类型 | 16 退保 / 51 过户 / 42 变更…(见规则字典) |
| `renewal_mode` | 续保模式 | `自留` / `外呼` / 空(新保) |
| `driver_age_group` | 被保险人年龄分组 | 年龄分段 |
| `insured_gender` | 被保险人性别 | 男 / 女 |
| `no_claim_bonus` | 无赔款优待记录 | NCD 历史 |
| `compulsory_ncd` | 交强险NCD | A0-A6 分组 |
| `compulsory_ncd_factor` | 交强险NCD浮动系数 | **派生字段**,A0=1.0 / A1=0.9 / A2=0.8 / A3=0.7 / A4=1.0 / A5=1.1 / A6=1.3 |
| `commercial_ncd` | 商业险NCD | 商业险 NCD 分组 |
| `highway_risk_level` | 高速风险等级 | 高速风险评估 |
| `insurance_grade` | 车险风险等级 | A-G/X(三字段合并) |
| `insurance_score` | 车险分分数 | 24-26 新格式数值 |

## claims_all 字段(赔案明细)

由按年分区的 claims_2019.parquet ~ claims_2026.parquet 合并而成,共 41 字段。

### 关联键
- `claim_no` 案件号
- `report_no` 报案号
- `policy_no` 关联保单号(JOIN policy_all 必先 `GROUP BY policy_no` 去重)
- `vehicle_frame_no` 车架号
- `subject_plate_no` 标的车牌号

### 时间(均为 TIMESTAMP)
- `report_time` 报案时间(常用)
- `accident_time` 出险时间
- `case_open_time` 立案时间
- `survey_time` 查勘时间
- `settlement_time` 调度处理时间
- `payment_time` 赔付时间
- `insurance_start_date` 保险起期(关联用)
- `insurance_year` 保险年份(BIGINT)

### 金额(DOUBLE,元)
- `settled_amount` **已决赔款**(满期赔付率分子之一)
- `pending_amount` **未决赔款**(满期赔付率分子之一)
- `reserve_amount` 准备金合计
- `reserve_bodily_amount` / `reserve_vehicle_amount` / `reserve_property_amount` 各项准备金
- `settled_vehicle_amount` 已决车损
- `settled_bodily_amount` 已决人伤
- `settled_fee` 已决费用

### 案件属性
- `loss_category` 损失类别
- `accident_description` 事故描述
- `treatment_type` 处理方式
- `accident_cause` 事故原因
- `accident_province` / `accident_city` / `accident_district` / `accident_address` 出险地
- `case_type` / `scene_type` 案件类型/现场类型
- `liability_ratio` 责任比例(BIGINT,百分数)
- `is_bodily_injury` 是否人伤(BOOL)
- `is_recovery` 是否回收(BOOL)
- `claim_status` 赔案状态
- `third_party_repair` 三者修理方
- `subject_repair_shop` / `subject_shop_code` / `subject_repair` 标的修理厂

> **首次会话查全 schema**:`node scripts/query.mjs "DESCRIBE claims_all"`

## quotes_all / cross_sell_all / renewal_all / customer_flow_all

这几张表 schema 较小且会随 ETL 演进,首次使用时:

```bash
node scripts/query.mjs "DESCRIBE quotes_all"
node scripts/query.mjs "DESCRIBE cross_sell_all"
node scripts/query.mjs "DESCRIBE renewal_all"
node scripts/query.mjs "DESCRIBE customer_flow_all"
```

## 维度表 schema 速查

```bash
node scripts/query.mjs "DESCRIBE dim_salesman"       # 业务员归属机构/团队
node scripts/query.mjs "DESCRIBE dim_plan"           # 计划目标
node scripts/query.mjs "DESCRIBE dim_brand"          # 厂牌→品牌
node scripts/query.mjs "DESCRIBE dim_plate_region"   # 车牌前缀→省市
```

## 关键派生字段计算

部分字段在 ETL 中已派生,直接使用即可:
- `compulsory_ncd_factor`:从 `compulsory_ncd` 前缀映射
- `insurance_grade`:从三个风险等级字段合并

需自己派生的常用字段:

```sql
-- 满期比率(0-1):已过去多少天 / 365.25
LEAST(1, GREATEST(0,
  date_diff('day', insurance_start_date, CURRENT_DATE) / 365.25
)) AS earned_ratio

-- 满期保费
premium * earned_ratio AS earned_premium

-- 是否摩托
(customer_category = '摩托车') AS is_motorcycle

-- 是否商业险出单(推介率分母)
(coverage_combination IN ('主全', '交三')) AS is_commercial_unit

-- 车牌归属省份
SUBSTRING(plate_no, 1, 1) AS plate_province
```
