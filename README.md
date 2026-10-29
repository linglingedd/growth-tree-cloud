# 成长树云端版

原项目 `D:\growth-tree-bot` 的独立云端部署副本。前端放在 GitHub Pages，账号、数据库和后端函数放在 Supabase。原本的本地程序与 SQLite 文件保持不变。

## 上线状态

GitHub 仓库和 [Pages 网站](https://linglingedd.github.io/growth-tree-cloud/)已建立。Supabase 项目 `owvlslotbboxnshahggk` 的数据表、账号隔离规则、`growth-tree` 函数、登录邮箱白名单、邮件验证回跳地址和每天北京时间 21:30 的自动分析任务已部署。公开连接配置已写入 `docs/config.js`。当前 Supabase 中的 AI 密钥名称为“成长树”，而函数读取 `DEEPSEEK_KEY`；修正名称后分析才能运行。真实账号登录及跨设备同步仍需验证。请勿把 `.env`、`data/tree.db` 或 AI 密钥提交到 GitHub。

## 仍需完成

1. 网站发布后，用 `huangmeiling2008@126.com` 在网页注册并完成邮件验证，再登录并写一条记录。密码由你自己输入，不要发给我。
2. 在 [Supabase Edge Functions Secrets](https://supabase.com/dashboard/project/owvlslotbboxnshahggk/settings/functions) 中新增一项名称准确为 `DEEPSEEK_KEY` 的密钥，值填入已配置在“成长树”项中的同一 DeepSeek 密钥。无需把值发到聊天。默认调用 `deepseek-chat`，自动分析可能产生 AI 平台费用；也可设置 `AI_BASE`、`AI_MODEL` 使用兼容服务。没有正确命名的密钥时，记录和浏览仍可用，分析会提示配置错误。
3. 在另一台设备登录同一邮箱，确认记录同步。需要导入原本的 2 条随手记和 1 篇觉察时，运行 `scripts/export_sqlite.py` 生成只保存在本地的 SQL 文件，再在 Supabase SQL Editor 导入。

## 已部署配置

前端来自 GitHub 仓库 `linglingedd/growth-tree-cloud` 的 `main` 分支 `/docs` 目录。后端只允许 `https://linglingedd.github.io` 来源，并只允许 `huangmeiling2008@126.com` 使用成长树函数。Supabase 邮箱验证仍开启，验证链接会返回 Pages 网站。`pg_cron` 和 `pg_net` 扩展已启用，`growth-tree-daily-analysis` 任务使用 `30 13 * * *`（UTC）计划，每天北京时间 21:30 调用后端。

当前云端版保留网页记录、原始记录历史查询、树、六维分析和厚信。“原始记录”页可按日期和正文关键词组合搜索，每页显示 20 条，仅返回当前登录账号的数据。原本的钉钉长连接机器人还在本地版运行；电脑关机时钉钉消息仍不能收取。网页本身可随时从手机和电脑访问。
