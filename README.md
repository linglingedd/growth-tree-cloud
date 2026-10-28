# 成长树云端版

原项目 `D:\growth-tree-bot` 的独立云端部署副本。前端放在 GitHub Pages，账号、数据库和后端函数放在 Supabase。原本的本地程序与 SQLite 文件保持不变。

## 上线状态

代码已准备，尚未连接你的 GitHub 和 Supabase 账号。`docs/config.js` 中的公开配置仍为空，所以当前网页不能登录。请勿把 `.env`、`data/tree.db` 或 AI 密钥提交到 GitHub。

## 需要你亲自操作的账号步骤

1. 登录 [GitHub](https://github.com/) 和 [Supabase](https://supabase.com/dashboard)。若没有账号，先完成注册。
2. 在 Supabase 新建项目，记下 Project URL 和 publishable key。选择免费计划前留意当前额度；AI 平台调用可能收费。
3. 在 GitHub 新建公开仓库 `growth-tree-cloud`，不要上传任何文件。GitHub Pages 的公开站点会公开网页代码，但不会公开数据库或密钥。
4. 把 GitHub 用户名、仓库地址、Supabase Project URL 和 publishable key 告诉我即可。publishable key 是设计为可公开的；请勿发送数据库密码、service role key、AI key 或登录密码。

账号就绪后，还需在 Supabase 控制台完成以下部署：

1. 在 SQL Editor 运行 `supabase/migrations/202610280001_growth_tree.sql`。
2. 在 Edge Functions 部署 `growth-tree`，关闭平台 JWT 验证（函数内会用 Supabase Auth 验证账号）。设置 `DEEPSEEK_KEY`、`GROWTH_TREE_ALLOWED_EMAILS`、`GROWTH_TREE_ORIGIN`、`GROWTH_TREE_CRON_SECRET` 四个服务端变量。`GROWTH_TREE_ALLOWED_EMAILS` 填允许使用的邮箱，多个用英文逗号隔开；`GROWTH_TREE_ORIGIN` 只填网站来源，例如 `https://username.github.io`，不含仓库路径和尾部斜杠。密钥只在 Supabase 控制台里填写。
3. 在 Supabase Authentication 的 URL Configuration 中，把 Pages 网址加入 Redirect URLs；确认邮箱密码登录开启。推荐保留邮箱验证。
4. 在 Supabase SQL Editor 中根据 `supabase/cron.example.sql` 配置每天北京时间 21:30 的自动分析。计划任务和 Edge Function 需要在项目里启用。
5. 将 Project URL 与 publishable key 写入 `docs/config.js`，推送仓库，然后在仓库 Settings > Pages 选择 `main` 分支的 `/docs` 目录发布。
6. 用自己的邮箱在网页注册并完成邮件验证。再用另一设备登录，检查同一条记录是否同步。需要导入原本的 2 条随手记和 1 篇觉察时，运行 `scripts/export_sqlite.py` 生成只保存在本地的 SQL 文件，然后在 Supabase SQL Editor 导入。

后台分析使用 DeepSeek 兼容接口。默认模型是 `deepseek-chat`，需要自备平台账号和余额；也可用服务端变量 `AI_BASE`、`AI_MODEL` 替换为兼容服务。没有配置 AI 密钥时，记录和浏览仍可用，六维分析会报配置错误。

当前云端版保留网页记录、树、六维分析和厚信。原本的钉钉长连接机器人还在本地版运行；电脑关机时钉钉消息仍不能收取。网页本身可随时从手机和电脑访问。
