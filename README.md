# chexian-query — 车险数据自然语言查询工作区

> 给非技术同事使用 TRAE(AI IDE)+ GLM-5.1 直接做车险数据分析的工作区。
> 你只需要说中文,GLM-5.1 自动写 SQL、跑 DuckDB、给业务结论。

---

## 你需要做的(四步)

### 第 1 步:装 Node.js(一次性,5 分钟)

打开 PowerShell:
```powershell
# 方式 A:用 winget(Win10/11 自带)
winget install OpenJS.NodeJS.LTS

# 方式 B:官网下载安装包
# 访问 https://nodejs.org/zh-cn/download → 下载 LTS Windows 安装包(.msi) → 双击安装
```

验证:
```powershell
node --version
# 应输出 v20.x.x 或更高
```

### 第 2 步:克隆代码(一次性)

```powershell
git clone https://github.com/alongor666/chexian-query.git
cd chexian-query
npm install
```

> ⚠️ 装 `duckdb` 需要 C++ 编译器。如果 `npm install` 报 "MSBuild.exe failed":
> 装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/zh-hans/visual-cpp-build-tools/) →
> 勾选 "C++ 桌面开发" 工作负载 → 重启 PowerShell 重试。

### 第 3 步:配置数据共享路径(一次性,1 分钟)

数据由**数据负责人**统一维护,放在内网 Windows 共享 `\\10.120.0.87\chexian-query\data`。
你不需要下载数据,只需要让本项目知道共享路径。

```powershell
# 1) 复制配置模板
copy .env.example .env

# 2) 用记事本打开 .env,把这一行取消注释:
#    DATA_BASE=//10.120.0.87/chexian-query/data
#
# (注意用双正斜杠,跨平台兼容)
```

> 💡 第一次访问 `\\10.120.0.87\chexian-query` 时,Windows 会要求输入凭据。
> 找数据负责人要用户名/密码,勾选"记住凭据"即可。

### 第 4 步:跑自检确认数据可达

```powershell
node scripts/verify.mjs
```

期望输出:11 个 VIEW 都有行数 + 客户类别 11 类 + 保费亿级,即成功。
如果报"VIEW 加载失败",检查:
- `\\10.120.0.87` 在 Windows 资源管理器中能否打开
- `.env` 中的 `DATA_BASE` 写法是否正确

---

## 怎么用(每次提问)

### 用 TRAE 打开本项目
1. 启动 TRAE,选"打开文件夹",指向 chexian-query 目录
2. TRAE 自动加载 `AGENTS.md` 和 `CLAUDE.md`(GLM-5.1 的行为指南)
3. 在 GLM-5.1 配置里,确保 API Key 已填(自付)

### 直接说中文
```
> 帮我看 2025 年 1 月各三级机构的剔摩满期赔付率,从高到低排
```

GLM-5.1 会:
1. 读 `docs/business-rules.md` 找口径
2. 写 SQL → 跑 `node scripts/query.mjs "<SQL>"`
3. 给你**业务结论 + 数据表 + 折叠 SQL**(详见 AGENTS.md 第七节)

---

## 代码 / 数据更新

### 代码更新(指标定义、业务规则、AI 指南)
```powershell
cd chexian-query
git pull
```

代码每次更新都会同步到所有同事。如果有 `npm install` 提示,运行一次。

### 数据更新(每天 / 每周一次,由数据负责人推送)
**你什么都不用做**。数据负责人把最新数据同步到 `\\10.120.0.87\chexian-query\data` 后,
你下次跑查询时直接看到的就是最新数据。

如果想知道当前数据时效:
```powershell
node scripts/verify.mjs
```

最后一栏的"签单日期"就是数据截至日期。

---

## 故障排查

| 现象 | 解决方法 |
|---|---|
| `npm install` 报 "MSBuild.exe failed" | 装 VS Build Tools(见第 2 步备注) |
| `verify.mjs` 报 "VIEW 加载失败" | 在 Windows 资源管理器试着打开 `\\10.120.0.87\chexian-query`,确认能进 |
| `\\10.120.0.87` 提示找不到 | 你不在公司内网。VPN 连上后再试 |
| 提示输入用户名/密码 | 找数据负责人要凭据,勾选"记住凭据" |
| GLM-5.1 写的 SQL 报 "syntax error" | 把 stderr 错误整段贴回 GLM,让它读 `docs/duckdb-cheatsheet.md` 后重写 |
| GLM-5.1 输出指标不对 | 让它读 `docs/business-rules.md` 第 N 条铁律后重新计算 |

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

共享路径的数据**未脱敏**,含车架号、车牌号、被保险人性别等敏感字段。

- ❌ 不要把查询结果(如客户清单)截图发到非工作群
- ❌ 不要把数据导出到本机后再传给项目外的人
- ✅ 业务结论(如"赔付率 65%")可正常分享

---

## 项目结构

```
chexian-query/
├── AGENTS.md              # AI 行为指南(给 GLM 读)
├── CLAUDE.md              # 同上,Claude 标准
├── README.md              # 你正在看的
├── .env.example           # 配置模板
├── package.json           # Node 依赖
├── scripts/
│   ├── setup.mjs          # 共享 VIEW 生成器(读 DATA_BASE)
│   ├── query.mjs          # SQL 执行器
│   └── verify.mjs         # 数据自检
├── docs/
│   ├── schema.md          # 字段定义
│   ├── business-rules.md  # 业务铁律
│   ├── duckdb-cheatsheet.md  # DuckDB 方言
│   └── examples/          # 5 条样板
└── data/                  # (默认本地数据目录,SMB 模式不使用)
```

---

## 联系

- 数据更新 / SMB 凭据问题:找 [数据负责人]
- AI 输出有疑问:把对话片段截图发到群,大家会帮你看
- 项目本身的 bug / 想加新文档:GitHub issue 或发到群
