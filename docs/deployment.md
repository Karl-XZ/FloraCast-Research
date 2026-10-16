# 安装、配置与部署

## 1. 环境

- Node.js 20 或以上及 npm；建议使用 Node.js 22 LTS。
- Git，以及支持 WebGL 的现代浏览器。
- 能访问所选地图、NASA、iNaturalist 及 AI 服务的网络。
- Python / openJiuwen 属于研究工作台的可选运行方式，地图平台的基本启动使用 Node.js。

## 2. 下载与安装

在 GitHub 或 Gitee 中任选一个仓库下载，两个地址维护同一项目：

```bash
git clone https://github.com/Karl-XZ/FloraCast-Research.git
# 国内网络也可以使用：
# git clone https://gitee.com/karl-zhou/FloraCast-Research.git
cd FloraCast-Research
npm ci --prefix server
```

依赖版本由 `server/package-lock.json` 锁定。优先使用 `npm ci`，安装时保留原有锁文件。遇到下载问题时检查锁文件中的包下载地址与网络可达性。

## 3. 配置

在仓库根目录创建 `.env`：

**Windows PowerShell**

```powershell
Copy-Item .env.example .env
```

**Linux / macOS**

```bash
cp .env.example .env
```

在本地编辑 `.env`，填入本人有权使用的服务配置：

| 变量 | 用途 | 配置说明 |
|---|---|---|
| `PORT` | 本地 HTTP 端口 | 示例配置为 `5174`；未设置时当前服务器代码默认为 `5173` |
| `DEEPSEEK_API_KEY` | 文本问答及历史气象语义解析 | 当前仓库的历史气象解析器使用 DeepSeek |
| `DEEPSEEK_API_BASE` | 文本模型接口根地址 | 示例为 `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | 模型标识 | 按本人服务账户支持的模型填写，例如 `deepseek-chat`；示例文件保留原有配置值 |
| `QWEN_API_KEY` | Qwen 文本或视觉服务 | 植物识别需要可调用的视觉模型 |
| `QWEN_API_BASE` | OpenAI 兼容接口根地址 | 示例为 `https://dashscope.aliyuncs.com/compatible-mode/v1`；应与密钥所属服务一致 |
| `QWEN_TEXT_MODEL` | Qwen 文本模型 | 根据账户可用模型填写 |
| `QWEN_VISION_MODEL` | Qwen 视觉模型 | 根据账户可用模型填写 |
| `AMAP_WEB_KEY` | 服务端逆地理编码 | 按需配置对应服务的 Web Key |
| `RESEARCH_PYTHON` | 研究工作台 Python 解释器 | 可选；填安装 openJiuwen 的解释器完整路径 |
| `RESEARCH_DATA_DIR` | 研究任务持久化目录 | 可选；默认位于根目录 `.research-data` |

`.env` 在根目录优先加载，其次检查 `.env.local`、`server/.env` 及当前工作目录中的配置。已设置的进程环境变量优先于 dotenv 文件；修改文件后重新启动进程。

## 4. 启动

```bash
npm start --prefix server
```

使用示例端口时打开：

- 地图平台：`http://localhost:5174/`
- 研究工作台：`http://localhost:5174/research.html`
- 健康检查：`http://localhost:5174/api/health`

根目录 `start_server.bat` 也可以在 Windows 下启动现有服务。端口以 `.env` 和启动日志为准。

健康检查中的 `ok: true` 表示进程已启动；服务配置状态以布尔字段显示。外部接口是否能成功返回数据，按 [核心流程](demo-guide.md) 分别检查。

## 5. 功能依赖

| 功能 | 所需资源 |
|---|---|
| 地图、图层、分屏 | 浏览器图形能力与所选图层服务；前端库通过 CDN 加载 |
| 植物观测与照片 | iNaturalist 的观测和图片服务 |
| 植物识别 | 已配置的 Qwen 视觉服务，及可读取的图片 |
| AI 助手 | 已配置的 DeepSeek 或 Qwen 文本服务；天气和植被上下文另依赖各自数据源 |
| 历史气象搜索 | DeepSeek 查询解析，以及 NASA POWER 逐日数据 |
| 植被指数与物候 | ORNL MODIS / NASA POWER 等数据接口 |

当前源代码和在线部署可能处于不同发布阶段。复核结果时记录各自的提交号、配置、地点和数据日期。

## 6. Docker

```bash
docker build -t floracast:local .
docker run --rm --env-file .env -e PORT=7860 -p 7860:7860 floracast:local
```

打开 `http://localhost:7860/`。现有 Dockerfile 提供 Node 服务，研究工作台默认使用 JavaScript 运行方式；需要 Python 调度时，在派生镜像中安装对应环境并加入 `services/research`。

`.dockerignore` 排除本地密钥、依赖目录与缓存。需要跨容器保留研究记录时，将 `/app/.research-data` 挂载到持久化目录。

## 7. 可选 Python 工作流

```bash
python -m venv .venv
```

激活环境后安装：

```bash
python -m pip install -r services/research/requirements.txt
```

`RESEARCH_PYTHON` 指向该环境解释器；依赖和 Python 版本兼容范围以 openJiuwen 对应版本说明为准。相关运行入口位于 `server/jiuwen-runtime.js` 和 `services/research/jiuwen_workflow.py`。

## 8. 常见问题

| 现象 | 排查顺序 |
|---|---|
| 页面空白或地球未加载 | 检查浏览器控制台、WebGL、Cesium CDN 和地图图层连接 |
| AI 返回鉴权或模型错误 | 检查密钥、接口根地址和模型名称是否属于同一个服务；重启进程 |
| 植物照片为空 | 检查日期、半径和地面观测覆盖；适当扩大查询范围 |
| 历史天气没有结果 | 检查解析出的地点与范围、NASA 返回值、日期连续性和缺失字段 |
| 植被值为空 | 检查产品日期、所选点是否位于陆地及数据质量 |
| 脚本调用 API 得到 403 | 当前服务检查 Referer；本地功能请求可使用 `Referer: http://localhost:5174/`，健康检查支持本地直连 |
| 端口已占用 | 修改 `.env` 中的 `PORT`，重启并使用相同的新端口访问 |

对外部署时沿用现有同源访问方式，并核对代码中配置的域名与来源检查。Nginx 的限流和 HTTPS 属于具体部署配置，需要部署者自行配置和验证。
