# data/ — 默认本地数据目录(可选)

本目录是 `DATA_BASE` 环境变量的默认值。

## 推荐用法:不放数据,改用 SMB 共享

参见项目根 [`README.md`](../README.md) 第 3 步:
```
DATA_BASE=//10.120.0.87/chexian-query/data
```

数据负责人统一维护共享盘,你**不需要**在本目录放任何文件。

## 备用用法:本地数据(无内网时)

如果你需要离线工作或外网测试,可把数据负责人发的 `chexian-data.zip` 解压到本目录:

```
data/
├── policy/current/*.parquet
├── claims/claims_*.parquet
├── quotes/latest.parquet
├── cross_sell/latest.parquet
├── renewal/latest.parquet
├── customer_flow/latest.parquet
└── dim/{salesman,plan,brand,repair,plate_region}/*.parquet
```

此时把 `.env` 的 `DATA_BASE` 注释掉(或设为 `./data`)即可。
