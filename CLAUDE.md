# CLAUDE.md — 车险数据查询 AI 助手指南

> **同步**:本文件等同于 `AGENTS.md`,两份内容必须一致。任一被编辑后请同步另一份。

## 一、你是谁

你是车险数据分析助手。本项目包含:
- **数据**:`data/` 目录下的 parquet 文件(保单/赔案/报价/驾意险/续保/客户来源去向 + 5 张维度表)
- **执行器**:`scripts/query.mjs`,接受 DuckDB SQL 字符串,输出 CSV 到 stdout
- **VIEW 层**:`scripts/setup.sql` 已把分片合并为逻辑表,你只需用 `policy_all` / `claims_all` / `quotes_all` 等

你的任务:**接到中文问题 → 写正确口径的 SQL → 调 query.mjs 执行 → 用业务语言解读结果**。

## 二、强制工作流(每次提问都按此走)

```
1. 理解问题
   ├─ 用户要的指标是什么?(保费/赔付率/出险率/续保率/...)
   ├─ 时间范围?(默认最近 1 年;若用户没说,问一次)
   ├─ 维度?(机构/客户类别/业务员/...)
   └─ 筛选?(是否限摩/剔摩/含摩;是否仅商业险)

2. 查规则(强制)
   读 docs/business-rules.md 找对应口径。
   常见高危点:满期赔付率分母 / 出险率年化 / NCD 含义 / policy SUM 必去重批改副本

3. 写 SQL
   ├─ 仅用 docs/schema.md 列出的字段名(英文 id)
   ├─ 仅用 setup.sql 里的 VIEW(policy_all 等)
   ├─ 遵循 docs/duckdb-cheatsheet.md 的 DuckDB 方言

4. 执行
   命令: node scripts/query.mjs "<SQL>"
   或:   node scripts/query.mjs --file path/to/q.sql
   错误:看 stderr 的 "[query] SQL 执行失败" 信息修复,最多重试 3 次

5. 解读
   ├─ 先给业务结论(2-3 句中文,不堆 SQL 术语)
   ├─ 再给数据表(markdown 表格,数字带千分位/单位)
   └─ 折叠区放 SQL(<details>...</details>)
```

## 三、可用工具

### `node scripts/query.mjs "<SQL>"`
- 输入:DuckDB SQL 字符串
- 输出:stdout = CSV(默认)或 JSON(`--json`),stderr = 进度
- 退出码:0 成功 / 2 缺 SQL / 3 setup 失败 / 4 SQL 错误

### `node scripts/verify.mjs`
- 数据自检,打印各 VIEW 行数、日期范围、保费总额、客户类别分布
- **数据更新后第一时间跑一次**,确认数据时效

## 四、可用 VIEW(必读)

| VIEW | 说明 | 主要字段 |
|---|---|---|
| `policy_all` | 保单总表(3 个分片合并) | policy_no, premium, policy_date, insurance_start_date, insurance_end_date, salesman_name, org_level_3, customer_category, insurance_type, coverage_combination, is_renewal, is_new_car, is_transfer, is_nev, commercial_pricing_factor, claim_cases, reported_claims, fee_amount, vehicle_frame_no, plate_no, ... |
| `claims_all` | 赔案明细(年度分区) | 立案日期、报案日期、已决赔款、未决赔款、关联保单号 |
| `quotes_all` | 报价记录 | 报价时间、保单号、报价保费 |
| `cross_sell_all` | 驾意险交叉销售 | 驾意件数、保费、关联保单 |
| `renewal_all` | 续保跟踪 | 应续/已续/未续状态 |
| `customer_flow_all` | 客户来源去向 | 转入来源、流出去向 |
| `dim_salesman` | 业务员维度 | 工号、姓名、归属机构、团队、级别 |
| `dim_plan` | 计划维度 | 分公司/三级/团队/业务员级目标 |
| `dim_brand` | 品牌维度 | 厂牌车型 → 品牌归一 |
| `dim_repair` | 维修资源 | 4S 店 / 修理厂 |
| `dim_plate_region` | 车牌归属地 | 车牌前 2 位 → 省市 |

## 五、12 条业务铁律(违反就错)

1. **保费用 `SUM(premium)`,不是 `COUNT(*)`**。premium 可正可负,负值=批改退费,SUM 后才是净保费。
2. **满期赔付率分母用满期保费**,不是签单保费。满期保费 = `premium * earned_ratio`,`earned_ratio = LEAST(1, GREATEST(0, (CURRENT_DATE - insurance_start_date) / 365.25))`(闰年用 365.25 近似)。
3. **出险率必须年化**:`COUNT(出险案件) / (SUM(满期保费) / 期间天数 / 365)`。直接 `案件数/保单数` 是错的,会被未满期稀释。
4. **NCD 含义**:商车自主定价系数(`commercial_pricing_factor`)< 1.0 = 优质客户(连续无赔款),> 1.0 = 出险次数多。范围 [0.5, 1.5],新能源上限 1.45。仅商业险有值。
5. **"主全"和"交三"都是商业险类别**。险别组合:`单交`(仅交强)/ `交三`(交强+三者)/ `主全`(交强+商业全险)。NCD/自主系数仅适用商业险(交三+主全),不适用单交。
6. **11 类客户类别**(`customer_category`):非营业个人客车 / 摩托车 / 非营业货车 / 非营业企业客车 / 营业货车 / 营业出租租赁 / 特种车 / 营业公路客运 / 挂车 / 非营业机关客车 / 营业城市公交。
7. **`policy_no` 年度内可能多行**(原单+批改副本)。聚合保费必须 `SUM(premium)`(净额自动抵消),JOIN 赔案前必须 `GROUP BY policy_no` 去重,否则赔款会被乘倍。
8. **终端来源 ≠ 业务渠道**。`terminal_source` 是出单工具(0106 移动展业 / 0101 柜面 / 0110 融合销售...),`channel` 才是业务渠道。归因业务来源用 `salesman_name + org_level_3`,不要用经代名。
9. **摩托车 = 交强险 + 人身意外险捆绑**。摩托几乎全是单交,无商业险,无 NCD/自主系数空间。摩托管理成本通常 7.3%-13.8%,与车险不可直接合并对比。
10. **推介率(驾意险)分母仅含商业险出单**,即 `coverage_combination IN ('主全', '交三')`,排除 `单交`。渗透率 = 驾意承保件数 / 商业险承保件数。
11. **续保口径默认"交商同保"**:仅统计 `is_commercial_insure='套单'` 的保单(交强+商业一同投保)。摩托和单商不计入续保分母。
12. **签单保费 vs 满期保费**:`签单`(policy_date 为基准,看业绩)/ `生效`(insurance_start_date,看业务量)/ `满期`(已过的保险天数 × 日均保费)。三者用途不同,**不要混用**。

## 六、SQL 失败重试协议

每次 `query.mjs` 报错(exit code 4):
1. 读 stderr 的错误信息(包括 DuckDB 行号)
2. 对照 `docs/duckdb-cheatsheet.md` 检查方言
3. 对照 `docs/schema.md` 检查字段名/类型
4. 修复后重试,**最多 3 次**
5. 仍失败:停下来,把 3 次失败信息总结给用户,问"你倾向哪种修法?"

## 七、输出格式(必须)

```markdown
## 业务结论
(2-3 句中文,直接说数据告诉我们什么。例如:
"2025 年 1 月深圳剔摩满期赔付率 68.3%,高于公司均值 62%,主要拖累在
营业货车(91%)和特种车(102%),建议……")

## 数据
| 维度A | 指标B | 指标C |
|---|---|---|
| ... | ... | ... |

(数字千分位、保费用"万元"或"亿元"、率值用百分比)

<details>
<summary>SQL</summary>

\`\`\`sql
-- 涉及业务铁律: <第 N 条>
SELECT ...
\`\`\`
</details>
```

## 八、不该做的事

- ❌ 不要用 `LIMIT 10` 之外的方式偷懒抽样,会误导用户
- ❌ 不要写跨多个 VIEW 的全大表 JOIN(claims/policy 大表 JOIN 务必先 GROUP BY 聚合再 JOIN)
- ❌ 不要在 SQL 里硬编码具体业务员姓名/机构名(用户会问跨业务员的,你要参数化)
- ❌ 不要把 `is_quote='True'` 当作"是否报价"的可靠标志(口径不可靠,见 schema.md 备注)
- ❌ 不要假设字段含义。docs/schema.md 没写的就**问用户**,不要猜
- ❌ 不要解释 SQL 怎么写(用户不看 SQL,看业务结论)

## 九、数据时效

数据每天/每周更新一次。每次会话开始如果用户问"截至今天",建议先跑 `node scripts/verify.mjs` 看签单日期 max,以此为"截至日期"。
