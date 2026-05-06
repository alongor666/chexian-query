# 给 IT 的新同事配置 SOP

> 数据负责人引入新同事时,把这一篇发给 IT,IT 一次性配好同事电脑即可。

---

## 同事电脑需要装的东西(共 3 项)

### 1. Node.js 22 LTS(必须)

下载安装包(国内可达):
- **官方**:https://nodejs.org/zh-cn/download(下载 "Windows 安装包(.msi)" → LTS 版本)
- **如果官网慢**,用国内镜像:https://npmmirror.com/mirrors/node/latest-v22.x/

下载后:
1. 双击 `.msi`,一路 Next 装到默认路径(`C:\Program Files\nodejs\`)
2. 装完打开 PowerShell,跑 `node --version`,应输出 `v22.x.x`

**版本要求**:必须 22.x。20.x 也能跑但项目锁了 22,不建议用其他版本。

### 2. TRAE(AI 编辑器,必须)

下载:https://www.trae.cn/(国内站)

装完启动 TRAE → 在设置 → 模型/API → 配置 GLM-5.1 API Key(同事自付,或用公司统一 key — 这一步与本项目无关,找 TRAE 文档或采购对接)。

### 3. WinRAR / 7-Zip(可选,Win10/11 自带 zip 解压也能用)

如果同事电脑没有,装一个 7-Zip(免费):https://www.7-zip.org/

---

## 一次性配置(IT 操作)

### A. 配置 SMB 共享访问

1. Win 键 + R → 输 `\\10.120.0.87\chexian-query` → 回车
2. 弹出凭据框 → 输入数据负责人提供的账号/密码
3. **勾选"记住我的凭据"**
4. 应该能看到 `data\` 和 `release\` 两个文件夹

### B. 拷贝项目到 D:\chexian-query

1. 打开 `\\10.120.0.87\chexian-query\release\`
2. 找到最新的 `chexian-query-YYYYMMDD-XXXXXXX.zip`
3. 拷到本地 `D:\`(直接放在 D 盘根目录)
4. 右键 → 解压到当前文件夹
5. 解压后应该是 `D:\chexian-query\`,里面有 `README.md`、`scripts\` 等

### C. 验证可用

打开 PowerShell:
```powershell
cd D:\chexian-query
node scripts/verify.mjs
```

应该输出:
```
[verify] DATA_BASE = //10.120.0.87/chexian-query/data
1. VIEW 行数
  policy_all           255 万 行
  ...
✅ 自检完成
```

如果第一次跑很慢(>1 分钟),正常 — Defender 在扫描 `duckdb_node.node`。

---

## 后续维护

### 同事说"打不开"

1. 打开"此电脑" → 看 `\\10.120.0.87\chexian-query\` 能不能进
   - 不能进 → 网络问题或中转机宕机,联系数据负责人
   - 能进 → 走第 2 步
2. 打开 PowerShell,跑 `cd D:\chexian-query; node scripts/verify.mjs`
   - 报"找不到 node" → 重装 Node.js 22 LTS
   - 报 "VIEW 加载失败" → 检查 `D:\chexian-query\.env` 内容是否为 `DATA_BASE=//10.120.0.87/chexian-query/data`
   - 其它错误 → 截图发数据负责人

### 同事说"要装新版"

1. 数据负责人会在群里发新版 zip 的下载位置(一般在 `\\10.120.0.87\chexian-query\release\`)
2. 同事自己拷到 `D:\` 后,双击 `D:\chexian-query\update.bat`,完成
3. 如果 update.bat 报错(被占用) → 让同事关闭 TRAE 再双击

### 同事离职 / 调岗

- 项目本身没有用户级凭据,**不需要在项目里做撤销操作**
- SMB 凭据走域账号 → 域账号停用后自动失效
- 本地 `D:\chexian-query\` 文件夹按公司离职数据清理流程处理
- TRAE / GLM API Key 走公司统一回收流程

---

## 常见 IT 风险点

| 风险 | 应对 |
|---|---|
| Defender 把 `duckdb_node.node` 当病毒查杀 | 把 `D:\chexian-query\node_modules\duckdb\` 加入 Defender 例外 |
| PowerShell 执行策略阻止 `update.bat` 调用 PowerShell | 同事电脑跑过一次 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`(或在 update.bat 里已加 `-ExecutionPolicy Bypass`) |
| 公司禁用 SMBv1 / SMBv2 | 中转机的 SMB 必须开 SMBv2/3,确认 Windows 共享走的是新版本 |
| 同事 D: 盘没有 / 容量不足 | chexian-query 解压后约 80-150 MB(含 node_modules)。容量不足换其他盘的话,统一换路径并通知数据负责人改 README |
| Defender 首启扫描太慢(>5 分钟) | 把整个 `D:\chexian-query\` 加例外 |
