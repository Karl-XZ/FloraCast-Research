# 第三方软件、数据与服务

## 项目代码

FloraCast 代码按根目录 [LICENSE](LICENSE) 中的 MIT License 发布，保留原有版权声明。第三方软件继续采用其自身许可；外部地图、观测照片、模型服务和数据的使用条件分别记录如下。

## 服务端与前端软件

| 组件 | 版本依据 | 许可 | 用途与来源 |
|---|---|---|---|
| Express | `server/package-lock.json` | MIT | HTTP 服务；[项目](https://github.com/expressjs/express) |
| Axios | 同上 | MIT | 服务端 HTTP 请求；[项目](https://github.com/axios/axios) |
| dotenv | 同上 | BSD-2-Clause | 环境配置；[项目](https://github.com/motdotla/dotenv) |
| form-data | 同上 | MIT | 表单请求；[项目](https://github.com/form-data/form-data) |
| Multer | 同上 | MIT | 图片上传；[项目](https://github.com/expressjs/multer) |
| CesiumJS | 前端引用 `1.136.0` | Apache-2.0 | 三维地图；[许可](https://github.com/CesiumGS/cesium/blob/1.136/LICENSE.md) |
| Plotly.js | 前端引用 `2.35.2` | MIT | 图表；[许可](https://github.com/plotly/plotly.js/blob/v2.35.2/LICENSE) |
| TensorFlow.js | 前端引用 `4.18.0` | Apache-2.0 | 浏览器建模；[许可](https://github.com/tensorflow/tfjs/blob/tfjs-v4.18.0/LICENSE) |
| Marked | 前端 CDN 未固定版本 | MIT | Markdown 渲染；[许可](https://github.com/markedjs/marked/blob/master/LICENSE.md) |
| openJiuwen | 可选 Python 依赖 `0.1.17.post1` | Apache-2.0 | 研究工作流；[发行包](https://pypi.org/project/openjiuwen/0.1.17.post1/) |

全部锁定的 npm 直接与传递依赖见 [依赖清单](docs/dependency-inventory.md)。安装包中保留各依赖的许可文本；重新分发打包后的第三方软件时同时保留其版权、LICENSE 及适用的 NOTICE。

前端 CDN 资源在浏览器运行时加载。Marked 目前使用滚动版本地址，复现时应记录实际响应版本；后续版本固定安排见 [路线图](ROADMAP.md)。

## 数据与图层

| 来源 | 使用内容 | 引用与使用条件 |
|---|---|---|
| NASA POWER | 逐日温度、降水、湿度、风速及辐射 | 保留产品、变量、单位、日期与坐标；遵循 [引用指南](https://power.larc.nasa.gov/docs/referencing/) 和 [致谢说明](https://power.larc.nasa.gov/docs/acknowledgements/) |
| NASA GIBS / Earthdata | 卫星影像图层 | 保留图层及数据产品名称、观测日期和产品引用；[GIBS 文档](https://nasa-gibs.github.io/gibs-api-docs/) |
| ORNL DAAC MODIS | 植被指数、日期和质量字段 | 保留产品名称、版本、合成日期与质量处理；按对应数据集引用；[子集服务](https://modis.ornl.gov/data/modis_webservice.html) |
| iNaturalist | 观测记录、分类信息和照片 | 观测和照片分别授权，按每条记录与每张图片的许可、作者及原始链接处理；[官方许可说明](https://help.inaturalist.org/en/support/solutions/articles/151000173511) |
| OpenPortGuide | 天气预报图层及标识 | 标准天气图层为 CC BY-NC-SA 4.0，保留可见来源和许可信息；[服务条款](https://weather.openportguide.de/index.php/de/nutzungsbedingungen) |
| OpenStreetMap | 地图数据及标准瓦片 | 数据遵循 ODbL，显示贡献者署名；标准瓦片另遵循服务政策；[版权](https://www.openstreetmap.org/copyright)、[瓦片政策](https://operations.osmfoundation.org/policies/tiles/) |
| 高德、天地图等底图服务 | 道路或影像底图、地理编码 | 依各服务的授权、密钥、署名、配额及使用条款配置；[高德](https://lbs.amap.com/)、[天地图](https://www.tianditu.gov.cn/) |
| OpenAlex | 研究工作台文献元数据 | 引用相应论文与 DOI，保留元数据来源；[OpenAlex](https://docs.openalex.org/) |

## 图片与导出

仓库中的应用截图用于说明界面和操作；其中地图、照片与第三方标识继续适用原有来源条件。使用 iNaturalist 图片时记录作者、许可与观测链接；导出或发布包含图片的文档、视频或数据包时按逐张许可处理。[iNaturalist 图片使用说明](https://help.inaturalist.org/en/support/solutions/articles/151000169918)

商业部署涉及的第三方资源需要按各自条件选择和授权。例如 OpenPortGuide 标准图层包含非商业限制，可联系提供方取得适当授权或使用其他符合用途的图层。

## 外部模型服务

DeepSeek 和 Qwen 接口由使用者自己的服务配置调用，适用各提供方的账户、配额、计费与数据处理条件。FloraCast 仓库提供接口调用代码，未包含这些服务的模型权重。使用开放权重模型部署替代服务时，另外记录具体模型版本、权重许可、运行环境和接口配置。

## 更新流程

新增或升级依赖时更新锁文件及依赖清单；新增图层、照片、数据或模型时记录来源、版本、许可与署名方式。在 PR 中说明变更，由维护者按 [贡献流程](CONTRIBUTING.md) 审核。
