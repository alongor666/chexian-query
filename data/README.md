# data/ — 数据目录

> 本目录存放 parquet 数据文件,**不入 Git**。同事需从下文渠道获取数据后放置。

## 目录结构(必须严格按此摆放)

```
data/
├── policy/
│   └── current/
│       ├── 01_签单清单_全量_21-23年.parquet
│       ├── 01_签单清单_剔摩_*.parquet
│       └── 01_签单清单_限摩_*.parquet
├── claims/
│   ├── claims_2019.parquet
│   ├── claims_2020.parquet
│   ├── claims_2021.parquet
│   ├── claims_2022.parquet
│   ├── claims_2023.parquet
│   ├── claims_2024.parquet
│   ├── claims_2025.parquet
│   └── claims_2026.parquet
├── quotes/
│   └── latest.parquet
├── cross_sell/
│   └── latest.parquet
├── renewal/
│   └── latest.parquet
├── customer_flow/
│   └── latest.parquet
└── dim/
    ├── salesman/        # 业务员维度
    │   └── *.parquet
    ├── plan/            # 计划维度
    │   └── *.parquet
    ├── brand/           # 品牌维度
    │   └── *.parquet
    ├── repair/          # 维修资源维度
    │   └── *.parquet
    └── plate_region/    # 车牌归属地维度
        └── *.parquet
```

## 数据获取渠道(三选一)

### 渠道 A:网盘下载(推荐)
1. 找数据负责人索取分享链接(坚果云/百度网盘/腾讯文档)
2. 下载 `chexian-data.zip`(约 230MB)
3. 解压到本目录,确保解压后结构与上方一致
4. Windows 解压建议用 7-Zip(右键 → 解压到 chexian-data\)

### 渠道 B:微信文件传输
1. 数据负责人通过 7-Zip 切片(每片 < 100MB)发送
2. 全部下载到本目录后,7-Zip 右键合并解压

### 渠道 C:VPS 直拉(适合长期同步)
1. 数据负责人开通只读 sftp 账号
2. Windows 用 WinSCP 连接,目标目录:`/var/www/chexian/server/data/`
3. 同步到本地 `data/` 目录

## 数据更新

数据每天会更新一次。建议每周或每月找数据负责人要一份新的 zip 替换。
保单签单日期、赔案 minmax 日期可通过下面命令查看本地数据时效:

```bash
node scripts/verify.mjs
```

## 数据脱敏说明

本数据**未脱敏**,包含车架号(VIN)、车牌号、被保险人性别等敏感字段。
**禁止外发、上传公网、用于商业用途之外的场景**。
