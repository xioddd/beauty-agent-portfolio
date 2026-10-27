# 在线工作台部署

前端入口：https://xioddd.github.io/beauty-agent-portfolio/workbench/

作品集首页保持在仓库根目录，React 工作台构建到 `workbench/`。Node API 运行在 Render。页面会明确显示 API 连接、Coze 配置或规则演示状态。

## Render

使用仓库根目录 `render.yaml` 创建 Blueprint，或手动创建免费 Web Service：

- Repository：`https://github.com/xioddd/beauty-agent-portfolio`
- Branch：`main`
- Root Directory：留空（图片目录也需要随服务部署）
- Runtime：Node
- Build Command：`npm ci --prefix app --omit=dev`
- Start Command：`node app/server.mjs`
- Health Check Path：`/api/health`
- 环境变量按 `render.yaml` 设置，`COZE_PAT` 只在 Render 的 Environment 中填写。

不要将 `.env`、令牌文件或整个本地材料包上传到仓库。`COZE_PAT` 不能使用 `VITE_` 前缀。Render 服务健康检查中的 `cozeConfigured` 只说明两个环境变量存在；实际授权需要对话实测确认。

## GitHub Pages

1. 仓库 Settings → Secrets and variables → Actions → Variables 中添加 `VITE_API_BASE_URL`，值为 Render 的 HTTPS 服务地址，不包含 `/api`。
2. Settings → Pages → Source 选择 GitHub Actions。
3. Actions → Deploy portfolio and workbench → Run workflow。
4. 访问工作台，验证生成内容、图片搜索与选用、普通闲聊保持已有节点。

`VITE_API_BASE_URL` 是公开后端地址，可以进入前端产物。它不属于凭证。构建会检查它是否为 HTTPS 地址。

## 本地测试

```powershell
cd app
$env:ASSET_ROOT='../multimodal_assets'
npm ci
npm test
$env:VITE_BASE_PATH='/beauty-agent-portfolio/workbench/'
$env:VITE_API_BASE_URL='https://你的服务.onrender.com'
npm run build
```

## 演示范围

图片查询基于 10 张人工整理的图片元数据与本地图片文件；官方图片、视频列表是来源索引。这里没有自建向量数据库，也没有自动视觉理解或视频内容检索。Coze 已发布 Agent 的知识召回由其自身配置提供。

公开电商图片只用于作品集演示，商业使用的授权尚未确认。不能根据图片单独确认产品版本、规格或功效。

API 限额为整个服务每小时 30 次 Coze 调用、最多 2 个并发，计数在服务重启时重置。CORS 是浏览器来源限制，不是身份验证。公开演示需要持续关注 Coze 用量；正式开放前应增加用户鉴权和持久化额度管理。

免费服务闲置后可能需要唤醒。前端连接提示会区分连接中、配置就绪、规则演示和连接失败；真实 Coze 调用失败会直接提示，不会伪装成生成成功。
