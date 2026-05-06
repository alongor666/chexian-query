# chexian-query — 车险数据自然语言查询工作区

> 给非技术同事使用 TRAE(AI IDE)+ GLM-5.1 直接做车险数据分析的工作区。
> 你只需要说中文,GLM-5.1 自动写 SQL、跑 DuckDB、给业务结论。

## 你需要做的(三步)

### 第 1 步:装 Node.js(一次性,5 分钟)

打开 PowerShell,运行(任选一个):

```powershell
# 方式 A:用 winget(Win10/11 自带)
winget install OpenJS.NodeJS.LTS

# 方式 B:官网下载安装包
# 访问 https://nodejs.org/zh-cn/download → 下载 LTS Windows 安装包(.msi) → 双击安装
```

验证安装:
```powershell
node --version
# 应输出 v20.x.x 或更高
```

### 第 2 步:装项目依赖(一次性,2 分钟)

```powershell
cd 路径\到\chexian-query
npm install
```

成功标志:`node_modules/duckdb/` 出现,无 ERROR 字样。

> ⚠️ 如果 `duckdb` 安装报错(常见于 Windows 缺 C++ 构建工具):
> ```powershell
> npm install --global windows-build-tools   # 老办法
> # 或装 Visual Studio Build Tools 2022 + Windows SDK
> ```

### 第 3 步:放数据(一次性 / 数据更新时)

数据负责人会通过网盘/微信/U 盘给你 `chexian-data.zip`(约 230MB)。

1. 把 zip 解压到本项目的 `data/` 目录
2. 解压后目录结构应该是:
   ```
   data/
   ├── policy/current/*.parquet
   ├── claims/claims_*.parquet
   ├── quotes/latest.parquet
   ├── ...
   └── dim/...
   ```
3. 详细结构见 [`data/README.md`](data/README.md)

数据放好后跑一次自检:
```powershell
node scripts/verify.mjs
```
看到"自检完成"+ 各 VIEW 行数,说明数据 OK。

---

## 怎么用(每次提问)

### 用 TRAE 打开本项目
1. 启动 TRAE,选"打开文件夹",指向 chexian-query 目录
2. TRAE 会自动加载 `AGENTS.md` 和 `CLAUDE.md`(GLM-5.1 的行为指南)
3. 在 GLM-5.1 配置里,确保 API Key 已填(自付)

### 直接说中文
```
> 帮我看 2025 年 1 月各三级机构的剔摩满期赔付率,从高到低排
```

GLM-5.1 会:
1. 读 `docs/business-rules.md` 找口径
2. 写 SQL → 跑 `node scripts/query.mjs "<SQL>"`
3. 给你**业务结论 + 数据表 + 折叠 SQL**(见 AGENTS.md 第七节)

---

## 故障排查

### `npm install` 报错 "MSBuild.exe failed"
Windows 缺 C++ 构建工具。装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/zh-hans/visual-cpp-build-tools/) → 勾选 "C++ 桌面开发" 工作负载 → 重启 PowerShell 重试。

### `node scripts/verify.mjs` 报 "data/policy/current/*.parquet not found"
数据没放对位置,或者文件名后缀大小写不对。重新检查 [`data/README.md`](data/README.md) 的目录结构。

### GLM-5.1 写的 SQL 报 "syntax error"
DuckDB 方言和 MySQL/PostgreSQL 不完全兼容。
**操作**:把 stderr 的错误信息整段贴回 GLM,让它读 `docs/duckdb-cheatsheet.md` 后重写。一般 1-2 次就好。

### GLM-5.1 输出的指标和你期望不符
可能是它套错了口径(比如赔付率分母用了签单保费而非满期保费)。
**操作**:让它读 `docs/business-rules.md` 第 X 条铁律后重新计算。

### 数据日期太旧(超过 1 周)
找数据负责人要新的 `chexian-data.zip` 替换,或者按 [`data/README.md`](data/README.md) 渠道 C 用 WinSCP 直拉。

---

## 我能问什么样的问题?

参考 `docs/examples/` 5 个样板:

| 例 | 问题 |
|---|---|
| [01](docs/examples/01_满期赔付率_机构维度.md) | 各机构满期赔付率 |
| [02](docs/examples/02_出险率年化_客户类别.md) | 各客户类别出险率(年化) |
| [03](docs/examples/03_NCD档位_实际vs满期赔付率.md) | NCD 档位 × 满期赔付率(定价有效性) |
| [04](docs/examples/04_业务员标保排名_Top30.md) | 业务员 Top30 排名 + 同比 |
| [05](docs/examples/05_续保率_交商同保口径.md) | 各机构续保率(交商同保口径) |

更复杂的也行:
- "把营业货车按吨位分段,看赔付率和保费规模,哪段在亏"
- "今年 12 月驾意险渗透率,按机构看,哪些机构主全保单没卖驾意"
- "客户来源去向:哪些客户从平安/人保转入了我司,主要在什么客户类别"

---

## 重要:数据保密

本项目的 parquet 数据**未脱敏**,含车架号、车牌号、被保险人性别等敏感字段。

- ❌ 不要把 `data/` 目录的内容外发、上传公网、发送到非工作微信
- ❌ 不要把查询结果(如客户清单)截图发到群
- ✅ 业务结论(如"赔付率 65%")可正常分享

---

## 项目结构

```
chexian-query/
├── AGENTS.md              # AI 行为指南(给 GLM 读)
├── CLAUDE.md              # 同上,Claude 标准
├── README.md              # 你正在看的
├── package.json           # Node 依赖声明
├── scripts/
│   ├── setup.sql          # 创建 VIEW(逻辑表层)
│   ├── query.mjs          # SQL 执行器
│   └── verify.mjs         # 数据自检
├── docs/
│   ├── schema.md          # 字段定义
│   ├── business-rules.md  # 业务铁律
│   ├── duckdb-cheatsheet.md  # DuckDB 方言
│   └── examples/          # 5 条样板
└── data/                  # 你的数据(不入仓库)
```

---

## 联系

- 数据更新 / 数据问题:找 [数据负责人]
- AI 输出有疑问:把对话片段截图发到群,大家会帮你看
- 项目本身的 bug / 想加新文档:发到 [项目负责人]
