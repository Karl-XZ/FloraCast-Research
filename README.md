# FloraCast 气候与植被分析平台

FloraCast 是一个面向气候与植被分析的开源平台，将地图与遥感信息、植物观测照片与种类识别、基于地点数据的智能问答，以及历史气象时段搜索整合在同一应用中。研究者可以快速寻找符合条件的历史天气过程，结合相应时期的影像、植被指数和植物观测开展分析。平台还包含研究工作台，用于组织研究任务、记录数据和生成报告。

- **在线体验**: [https://openl.work/FloraCast/](https://openl.work/FloraCast/)
- **独立研究工作台**: [https://openl.work/FloraCast/research.html](https://openl.work/FloraCast/research.html)
- **代码仓库**: [https://github.com/Karl-XZ/FloraCast-Research](https://github.com/Karl-XZ/FloraCast-Research)
- **国内镜像仓库**: [https://gitee.com/karl-zhou/FloraCast-Research](https://gitee.com/karl-zhou/FloraCast-Research)
- **魔搭创空间**: [https://modelscope.cn/studios/Karlzhy/FLORACAST](https://modelscope.cn/studios/Karlzhy/FLORACAST)
- **演示视频**: [https://www.bilibili.com/video/BV1UyJt6yETe/](https://www.bilibili.com/video/BV1UyJt6yETe/)

## FloraCast 气候与植被分析平台

研究一个地点的植被，往往需要同时查阅天气记录、遥感影像和地面植物观测。FloraCast 将这些信息放在同一张地图上，支持从空间浏览、植物观察到天气与植被关系分析的连续操作。

| 核心功能 | 可以完成的操作 | 具体用途 |
|---|---|---|
| 地图与遥感对比 | 打开图层、设置日期和透明度、分屏比较 | 查看同一地点不同时期的地表与植被变化 |
| 植物照片与识别 | 按地点和日期查找 iNaturalist 记录，查看照片并调用识别 | 将区域遥感信息联系到具体物种与地面观察 |
| 地点感知 AI 助手 | 结合气温、降水、植被指数和物候信息问答 | 整理当地环境状况，解释天气与植物生长之间的联系 |
| 历史气象搜索 | 用自然语言选择条件，检索并比较历史天气窗口 | 快速找到历史参照，再查阅同期影像和植物观测 |

平台还提供植被指数、积温与花期估计、月度物种记录、斑块分析、时序预测及研究工作台。各产品、照片和问答上下文的实际日期应分别核对，操作方法见 [使用流程](docs/demo-guide.md)。

### 文档与参与

| 内容 | 入口 |
|---|---|
| 安装、环境配置和 Docker | [部署说明](docs/deployment.md) |
| 四项核心功能及实际操作 | [使用流程](docs/demo-guide.md) |
| 技术架构和代码定位 | [架构说明](docs/architecture.md) |
| 测试命令、覆盖范围与执行结果 | [验证说明](docs/verification.md) |
| 问题反馈与代码贡献 | [贡献指南](CONTRIBUTING.md) |
| 维护负责人、决策和双平台同步 | [维护说明](GOVERNANCE.md) |
| 后续任务与验收方式 | [路线图](ROADMAP.md) |
| 软件、数据、图层与照片来源 | [第三方说明](THIRD_PARTY_NOTICES.md) |
| 版本变化 | [变更记录](CHANGELOG.md) |

### 已有成果

- 获得 AP-GARSS 2026 关联赛事 **开源地理人工智能实践挑战赛三等奖**。
- 项目论文 **《FloraCast：面向气候与植被分析的开源地理人工智能平台》** 获 2026 IEEE AP-GARSS 录用。
- 主要维护者：周昊洋，德国不莱梅大学计算机科学本科生。

项目代码采用 MIT 许可；外部数据、照片、地图和模型服务遵循各自条件，详见 [LICENSE](LICENSE) 与 [第三方说明](THIRD_PARTY_NOTICES.md)。

---

## 目录

- [1. 核心功能与科研模块](#1-core-features--scientific-highlights)
- [2. 八阶段科研工作流](#2-eight-stage-scientific-research-agent-pipeline)
- [3. 功能界面与操作示例](#3-key-features--visual-walkthrough)
  - [3.1 三维地球与多源底图](#31-3d-digital-twin-earth--multi-source-basemaps)
  - [3.2 科研智能体控制台](#32-collaborative-research-agent-console)
  - [3.3 自然语言历史气象搜索](#33-meteorological-semantic-search--multi-decadal-extreme-event-mining)
  - [3.4 植被分析与物候估计](#34-deterministic-biophysical-modeling--phenological-inversion)
  - [3.5 浏览器空间机器学习](#35-client-side-spatial-machine-learning-visual-geo-ml)
  - [3.6 独立研究工作台与报告生成](#36-independent-research-protocol-workbench--academic-synthesis)
- [4. 服务部署与访问管理](#4-production-security-hardening-architecture)
- [5. 技术栈与系统组成](#5-technology-stack--system-components)
- [6. 快速开始与本地部署](#6-quick-start--local-deployment)
- [7. 环境配置与运行管理](#7-environment-configuration-guidelines)
- [8. 数据来源与开源许可](#8-data-sources--open-licenses)

---

<a id="1-core-features--scientific-highlights"></a>

## 1. 核心功能与科研模块

气候与植被研究需要结合地图、逐日天气、遥感产品和地面观测。FloraCast 将这些数据的查询与分析连接起来，并提供以下科研模块：

1. **三维地球与图层对比**：基于 Cesium 和 WGS84 坐标系统，提供卫星图层、坐标导航和跨日期分屏对比。
2. **八阶段科研工作流**：记录研究方案、文献、数据对齐、建模、核验和报告等环节，通过 SHA-256 校验值比较冻结的输入与输出。
3. **植被与物候分析**：结合植被时序、积温阈值和 MODIS 质量字段，分析植物的季节变化。
4. **历史气象搜索**：获取选定年份的 NASA POWER 逐日记录，计算滑动窗口指标和异常程度，并按查询条件排序。
5. **空间机器学习**：在浏览器中进行空间特征探索和分类，通过图表与地图查看结果。

---

<a id="2-eight-stage-scientific-research-agent-pipeline"></a>

## 2. 八阶段科研工作流

研究工作台将任务组织为八个阶段，分别记录参数、数据、中间产物和执行状态：

```
[阶段 01：研究方案定义与范围冻结]
       │
       ▼
[阶段 02：文献检索与交叉核对]
       │
       ▼
[阶段 03：数据检查与校验值登记]
       │
       ▼
[阶段 04：时空模式与相关变量分析]
       │
       ▼
[阶段 05：统计核验与物候建模]
       │
       ▼
[阶段 06：证据链复核]
       │
       ▼
[阶段 07：独立快照复算与检查]
       │
       ▼
[阶段 08：研究报告生成]
```

各阶段保存结构化中间产物。校验值用于比较冻结的输入和输出，复算结果与外部验证情况分别记录在研究结果中。

---

<a id="3-key-features--visual-walkthrough"></a>

## 3. 功能界面与操作示例

<a id="31-3d-digital-twin-earth--multi-source-basemaps"></a>

### 3.1 三维地球与多源底图

地图界面提供地球浏览、空间测距、逆地理编码和多源影像叠加，支持按坐标定位并比较不同图层。

![三维地球界面](docs/images/doc_01_globe_overview_zh.png)

*图 1：沿海研究区域的三维地图，包含动态光照、经纬度网格和矢量底图。*

![功能导航菜单](docs/images/doc_02_menu_system_zh.png)

*图 2：功能导航菜单，提供科研任务、自然语言气象搜索、空间机器学习和遥感图层入口。*

---

<a id="32-collaborative-research-agent-console"></a>

### 3.2 科研智能体控制台

研究者可以用自然语言提出问题，例如研究天气变化后沿海植被的响应。智能体解析研究区域、时间范围和任务参数，并组织数据查询与分析。

![科研智能体控制台](docs/images/doc_03_agent_console_zh.png)

*图 3：科研控制台，支持输入研究问题、中心坐标、半径和历史基线参数。*

![八阶段工作流执行](docs/images/doc_04_agent_pipeline_reasoning_zh.png)

*图 4：八阶段工作流的执行过程与任务记录。*

---

<a id="33-meteorological-semantic-search--multi-decadal-extreme-event-mining"></a>

### 3.3 自然语言历史气象搜索

历史气象搜索将自然语言描述转为地点、年份、月份、窗口长度和变量条件，从多年逐日记录中寻找相近时段。查询可围绕少雨、持续降水、高温或其他天气特征展开，结果保留候选日期、排序分数和逐日指标。

![历史气象搜索结果](docs/images/doc_06_weather_search_results_zh.png)

*图 5：气象条件检索面板，展示候选时段与多变量气象指标。*

![候选事件指标对比](docs/images/doc_05_agent_matrix_chart_zh.png)

*图 6：候选事件对比，包含温度标准化指标、降水异常与连续少雨日数。*

---

<a id="34-deterministic-biophysical-modeling--phenological-inversion"></a>

### 3.4 植被分析与物候估计

系统结合 MODIS 相关产品和 NDVI、EVI 时序，查看植被季节变化，估计返青、旺盛生长和衰退等阶段，并分析天气过程前后的变化幅度与时间差。具体结果依据所选产品、质量字段和可用日期计算。

![植被指数分析](docs/images/doc_08_vegetation_index_zh.png)

*图 7：植被指数分析界面，用于查看植被时序及相关环境变化。*

![植被变化轨迹与分析](docs/images/doc_09_agent_chart_and_report_zh.png)

*图 8：植被变化轨迹和研究摘要，供天气过程前后的变化对照。*

---

<a id="35-client-side-spatial-machine-learning-visual-geo-ml"></a>

### 3.5 浏览器空间机器学习

空间机器学习模块提供特征探索、聚类和地图可视化，便于比较不同环境变量下的空间分布。计算方式随所选方法和浏览器能力而定。

![空间机器学习界面](docs/images/doc_07_visual_geoml_zh.png)

*图 9：空间机器学习界面，包含特征散点图、聚类和地图结果。*

---

<a id="36-independent-research-protocol-workbench--academic-synthesis"></a>

### 3.6 独立研究工作台与报告生成

独立研究工作台用于冻结研究参数、记录文献引用、检查原始数据和导出结构化报告，为结果复查与跨团队协作保留记录。

![独立研究工作台](docs/images/doc_10_research_workbench_zh.png)

*图 10：研究方案配置界面，包含参数冻结、参考文献和原始数据检查。*

![结构化研究报告](docs/images/doc_11_academic_report_zh.png)

*图 11：结构化研究报告，包含背景、方法、比较结果、证据核对和适用范围。*

---

<a id="4-production-security-hardening-architecture"></a>

## 4. 服务部署与访问管理

服务部署由网关和 Node.js 应用组成。本地运行直接启动应用；对外部署时，由部署者配置和验证 HTTPS、域名与请求限制。Nginx 配置需要随实际服务器环境设置。

```
浏览器请求
       │
       ▼ [Nginx 网关]
       ├── 来源检查：核对允许访问的域名
       ├── 请求限流：示例为每秒 2 次、突发上限 5 次
       └── 跨域访问配置
       │
       ▼ [Node.js 应用服务]
       ├── 应用层域名与来源检查
       ├── 从环境配置中读取模型服务密钥
       └── 外部请求超时与错误处理
       │
       ▼ [模型服务与科学计算]
       └── DeepSeek 服务接口与本地科学计算模块
```

- **请求限流**：可使用 `limit_req_zone $binary_remote_addr zone=floracast_limit:10m rate=2r/s;` 等 Nginx 配置控制请求频率。
- **请求来源检查**：对外部署可结合 `valid_referers server_names *.openl.work;` 等配置检查来源；当前应用也包含来源检查。
- **跨域访问**：按部署域名配置允许的来源，浏览器页面和接口优先使用同源访问。
- **密钥配置**：模型服务密钥由环境变量或服务器配置读取，部署者使用自己的服务账户和配额。

---

<a id="5-technology-stack--system-components"></a>

## 5. 技术栈与系统组成

| 层次 | 技术与依赖 | 用途与职责 |
| :--- | :--- | :--- |
| **界面层** | CesiumJS（1.136.0） | 三维地球交互与卫星图层显示 |
| | Plotly.js（2.35.2） | 交互式散点图、指标对比和时序曲线 |
| | TensorFlow.js | 浏览器端模型训练与推断 |
| | Marked.js | 结构化文字与报告渲染 |
| **服务层** | Node.js（20 及以上）与 Express | 接口服务、流式消息和数据缓存 |
| | Axios 与 Multer | 外部数据请求与图片上传 |
| | openJiuwen 工作流 | 可选的科研任务调度与状态管理 |
| **模型与计算** | DeepSeek 服务接口 | 自然语言解析、问题回答和研究报告生成 |
| | Qwen 视觉服务接口 | 植物图像识别与候选种类分析 |
| | 植被与物候计算 | 积温阈值、植被时序和相关指标分析 |
| **网关与运维** | Nginx | HTTPS、请求限流和反向代理 |
| | Systemd / Docker | 应用进程与容器部署管理 |

---

<a id="6-quick-start--local-deployment"></a>

## 6. 快速开始与本地部署

### 环境要求
- Node.js 20.0 或以上，建议使用 Node.js 22 长期支持版。
- Git
- 支持 WebGL 2.0 的现代浏览器，例如 Chrome、Edge 或 Firefox。

### 下载与安装

```bash
# 下载代码仓库
git clone https://github.com/Karl-XZ/FloraCast-Research.git
cd FloraCast-Research

# 安装服务端依赖
cd server
npm ci
```

### 环境配置

在项目根目录创建 `.env` 文件，或将 `.env.example` 复制后按自己的服务账户填写：

```ini
# DeepSeek 服务配置：气象条件解析、问答与报告生成
DEEPSEEK_API_KEY=
DEEPSEEK_API_BASE=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

# 可选的 Qwen 服务配置：植物图片识别与文本问答
QWEN_API_KEY=
QWEN_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_TEXT_MODEL=qwen-plus
QWEN_VISION_MODEL=qwen-vl-plus

# 服务端口
PORT=5174
```

### 启动应用

```bash
# 在 server 目录中运行
npm start
```

启动后在浏览器中访问：
- 三维地图平台：`http://localhost:5174/`
- 独立研究工作台：`http://localhost:5174/research.html`

在仓库根目录执行 `npm test --prefix server` 和 `npm run verify:local --prefix server` 进行检查。配置依赖见 [部署说明](docs/deployment.md)，检查范围与结果见 [验证说明](docs/verification.md)。

---

<a id="7-environment-configuration-guidelines"></a>

## 7. 环境配置与运行管理

1. **环境配置**：服务端通过 `process.env.*` 读取模型服务配置，缺少必要配置时返回对应错误。
2. **本地文件管理**：`.gitignore` 排除本地环境文件、缓存和运行输出；提交前检查实际差异。
3. **服务用量管理**：在模型服务平台中设置适合实际使用情况的配额与余额提醒，定期检查调用情况。

---

<a id="8-data-sources--open-licenses"></a>

## 8. 数据来源与开源许可

- **遥感数据**：NASA GIBS 图层及 MODIS Terra/Aqua 相关观测产品。
- **气象数据**：NASA POWER 逐日记录，查询范围由所选年份和实际可用数据决定。
- **天气预报图层**：[OpenPortGuide](https://weather.openportguide.de/)，标准图层采用 [CC BY-NC-SA 4.0 许可](https://creativecommons.org/licenses/by-nc-sa/4.0/)。
- **底图服务**：按所选图层使用高德、天地图、开放街图等来源。
- **开源许可**：FloraCast 代码采用 [MIT 许可](LICENSE)。

软件、地图、数据、照片与模型服务的来源和使用条件见 [第三方说明](THIRD_PARTY_NOTICES.md)。服务端精确依赖版本见锁文件及 [依赖清单](docs/dependency-inventory.md)。
