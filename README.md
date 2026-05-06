# chexian-query — 车险数据自然语言查询工作区

> 同事用 TRAE + GLM-5.1 直接说中文查车险数据,GLM 自动写 DuckDB SQL,出业务结论。

---

## 三种角色的入口

| 你是谁 | 看哪里 |
|---|---|
| 业务同事(查数据) | 找数据负责人要 `chexian-query-YYYYMMDD-XXXXXXX.zip`,解压到 `D:\chexian-query`,按里面的 `README.md` 5 步走 |
| IT(给同事配电脑) | [docs/IT-onboarding.md](docs/IT-onboarding.md) |
| **数据负责人 / 项目维护者** | 继续往下看 |

---

## 数据负责人专属

> 只有你一个人需要做这些事。同事和 IT 不看这一段。

### 1. 整体架构

```
Mac(你)─ ssh push ─▶ VPS ─ HTTPS pull ─▶ Win 中转机 ─ SMB ─▶ 同事 N 人
                  chexian.cretvalu.com    10.120.0.87
                  /data/(Basic Auth)     \\10.120.0.87\chexian-query\
                                          ├ data\(同事查询走这里)
                                          └ release\(同事拿新版 zip 走这里)
```

3 段同步:
- **Mac → VPS**:你日常 ETL 后,用 chexian-api 的 `scripts/sync-vps.mjs` 推
- **VPS → Win 中转机**:`node scripts/sync-https.mjs`(本项目,见下)
- **Win → 同事**:打成 zip,放共享盘,同事自己拷(本项目 `node scripts/package-for-colleagues.mjs`)

### 2. 一次性 VPS 端配置

VNC 控制台 root 跑一次:
```bash
curl -sL https://gh-proxy.com/https://raw.githubusercontent.com/alongor666/chexian-query/main/scripts/setup-https-share.sh | bash
```

输出包含 username/password,以及 Win 端 `.env` 要填的 3 行。详见 [CLAUDE.md §10](CLAUDE.md)。

### 3. 一次性 Win 中转机配置

1. 装 Node.js 22 LTS:`winget install OpenJS.NodeJS.LTS`(或国内镜像 https://npmmirror.com/mirrors/node/latest-v22.x/)
2. `git clone https://github.com/alongor666/chexian-query.git`(V2RayN 需要 GLOBAL 模式或加 GitHub 到代理白名单)
3. `cd chexian-query && npm install`
4. 在共享盘机器上创建 `D:\chexian-share\data` 和 `D:\chexian-share\release`,共享给"Everyone(只读)"
5. 复制 `.env.example` 为 `.env`,填:
   ```
   DATA_BASE=D:/chexian-share/data
   HTTPS_BASE_URL=https://chexian.cretvalu.com/data/
   HTTPS_USER=chexian-data
   HTTPS_PASS=<setup-https-share.sh 输出的密码>
   ```
6. **V2RayN 路由**:让 `chexian.cretvalu.com` 走代理(GLOBAL 模式,或自定义代理白名单)。否则会因为是大陆 IP 走直连,被公司防火墙切。

### 4. 日常 — 同步数据(每天/每周)

```powershell
cd D:\chexian-query
node scripts/sync-https.mjs
```

输出:
```
[sync] 远端: 20 个文件,合计 192.1 MB
[sync] 待下载: 3 个,12.4 MB
[1/3] policy/current/01_签单清单_增量_20260520.parquet  12.0 MB  NEW ... OK
[sync] ✅ 3 成功 / 0 失败
```

### 5. 日常 — 给同事打新版包

代码改了之后(改了业务规则、加了新 docs、改了 AGENTS.md 等),给同事发新版:

```powershell
cd D:\chexian-query
git pull                                  # 拉最新代码
npm install                               # 如有依赖变化
node scripts/package-for-colleagues.mjs   # 打包,默认输出到 dist/
```

输出 `dist/chexian-query-YYYYMMDD-XXXXXXX.zip`,大概 80-150 MB。

然后:
1. 把 zip 拷到 `\\10.120.0.87\chexian-query\release\`(直接拷,SMB 已挂载)
2. 群里通知:"新版 chexian-query-20260520-abc1234,下载到 D:\ 后双击 D:\chexian-query\update.bat"

> ⚠️ **必须在 Win 中转机上打包**,不能在 Mac 上打。duckdb 是平台相关 native binary,Mac 打的包给 Win 同事会报"找不到 duckdb_node.node"。

### 6. 常用命令速查

| 命令 | 用途 |
|---|---|
| `node scripts/sync-https.mjs --check` | 仅测试 HTTPS 连通(账号/密码/V2RayN 是否正常) |
| `node scripts/sync-https.mjs --dry-run` | 看待下载清单,不实际下载 |
| `node scripts/sync-https.mjs` | 增量同步 |
| `node scripts/sync-https.mjs --full` | 全量重下 |
| `node scripts/verify.mjs` | 验证本地数据可读、看签单日期 max |
| `node scripts/query.mjs "<SQL>"` | 跑 SQL(自动写审计日志到 `logs/query-YYYYMM.log`) |
| `node scripts/package-for-colleagues.mjs` | 打 zip 给同事 |
| `node scripts/package-for-colleagues.mjs --out D:/chexian-share/release` | 打完直接放共享盘 |

### 7. 换 HTTPS 密码

```bash
# VNC root 上:
rm /root/.chexian-data-password && curl -sL https://gh-proxy.com/https://raw.githubusercontent.com/alongor666/chexian-query/main/scripts/setup-https-share.sh | bash
```

记得改 Win 的 `.env` 里 `HTTPS_PASS` 同步更新。

---

## 项目结构

```
chexian-query/
├── AGENTS.md                       # AI 行为指南(给 GLM 读;Claude 等价)
├── CLAUDE.md                       # 同上
├── README.md                       # 本文件(数据负责人视角)
├── .env.example                    # 配置模板
├── package.json                    # Node 依赖,锁 Node 22
├── scripts/
│   ├── setup.mjs                   # 共享 VIEW 生成器(读 DATA_BASE)
│   ├── query.mjs                   # SQL 执行器(含审计日志)
│   ├── verify.mjs                  # 数据自检
│   ├── sync-https.mjs              # 中转机:从 VPS HTTPS 拉数据
│   ├── setup-https-share.sh        # VPS:开启 /data/ HTTPS 端点(VNC root 跑一次)
│   └── package-for-colleagues.mjs  # 中转机:打包 zip 给同事(必须 Win)
├── dist-template/                  # 打包时覆盖到同事版的内容
│   ├── .env                        # 同事版 .env(只有 DATA_BASE)
│   ├── update.bat                  # 同事版升级脚本
│   └── README-colleague.md         # 同事版 README(打包时改名为 README.md)
├── docs/
│   ├── IT-onboarding.md            # 给 IT 的新人配置 SOP
│   ├── schema.md                   # 字段定义
│   ├── business-rules.md           # 业务铁律
│   ├── duckdb-cheatsheet.md        # DuckDB 方言
│   └── examples/                   # 5 条样板查询
├── data/                           # 默认本地数据目录(可被 .env DATA_BASE 覆盖)
├── logs/                           # 审计日志(自动创建,gitignore)
└── dist/                           # package-for-colleagues.mjs 输出位置(gitignore)
```

---

## 文档导航

- [CLAUDE.md](CLAUDE.md) / [AGENTS.md](AGENTS.md):AI 行为规范、12 条业务铁律、诊断纪律
- [docs/business-rules.md](docs/business-rules.md):满期赔付率 / NCD / 出险率年化等口径
- [docs/schema.md](docs/schema.md):字段定义
- [docs/duckdb-cheatsheet.md](docs/duckdb-cheatsheet.md):DuckDB 方言
- [docs/examples/](docs/examples/):5 个查询样板
- [docs/IT-onboarding.md](docs/IT-onboarding.md):IT 配置同事电脑

---

## ⚠️ 数据保密

数据未脱敏(车架号/车牌/被保险人性别等)。
- 不要把含个人信息的查询结果导出/截图到非工作群
- GLM-5.1 处理时数据会上传智谱服务器,**不要让 GLM 列原始客户清单**(已知合规隐患,见 CLAUDE.md §10)

---

## 联系

- 同事问题:看同事拿到的 zip 里的 `README.md`,或直接找你
- IT 问题:[docs/IT-onboarding.md](docs/IT-onboarding.md)
- 项目代码 / bug:[GitHub issue](https://github.com/alongor666/chexian-query/issues)
