# 技术架构与代码入口

## 系统组成

```text
浏览器：地图、照片、图表与操作面板
  ├─ Cesium / Plotly / TensorFlow.js / Marked
  ├─ 地图及科学数据服务：NASA、ORNL、iNaturalist 等
  └─ 同源 /api 接口
       └─ Node.js / Express
            ├─ AI 文本与植物图片识别服务
            ├─ 历史逐日天气缓存、窗口计算与排序
            └─ 研究任务存储、复算和可选 Python 工作流
```

前端静态文件与 API 由同一服务提供。`public/api-base.js` 处理根路径和 `/FloraCast/` 子路径访问。前端根据功能直接读取部分公开数据接口，模型密钥由服务端读取。

## 四项核心功能

| 功能 | 实现与主要文件 | 输入与输出 |
|---|---|---|
| 地图与对比 | `public/cesium-map.min.js`、`public/leaflet-compat-cesium.js`、`public/app.js` 中地图及图层管理 | 坐标、图层、日期、透明度；返回地图与分屏视图 |
| 植物观测与识别 | `public/app.js` 的照片查询、`public/plantid.js`；`server/server.js` 中 `/api/plant/identify` 和 `/api/plant/identify_url` | 地点、日期、iNaturalist 记录或本地图片；返回照片和候选物种 |
| AI 助手 | `public/app.js` 中 `DataHub`、`AIManager`；服务端 `/api/ai/chat` | 所选地点及气象、植被、物候上下文和用户问题；返回文字解释 |
| 历史气象搜索 | `server/weather-search.js`、`weather-data.js`、`weather-features.js`；前端 `WeatherSearchManager` | 自然语言条件转为结构化范围，计算逐日窗口特征后返回排名与指标 |

## 历史搜索中的计算分工

模型用于解析自然语言中的地点、日期、时长、条件和权重；后续逐日数据处理、窗口特征计算和分数排序由 JavaScript 执行。

`weather-data.js` 获取 NASA POWER 数据并建立年内日序基线。`weather-features.js` 排除关键变量缺失和日期不连续的窗口，计算气温、降水、连续少雨日数等特征，并根据查询条件排序。基线范围来自本次请求的历史数据，使用结果时应记录该范围。

当前窗口筛选以中间日的月份和季节判断归属，日期位于边界附近的窗口可能跨月。少雨连续日数使用日降水小于 `0.1 mm` 的实现阈值；报告研究结果时应写明阈值，并区分气象少雨与土壤、农业或生态干旱。

## 植被、物候与预测

- 前端调用 ORNL MODIS 子集和产品日期接口；数据产品与合成日期随查询返回。
- `server/modis-quality.js`、`phenology.js` 及其测试提供质量控制和物候计算实现。
- `ForecastManager` 使用滞后的植被与气象特征，支持 TensorFlow.js 模型及线性回归路径。递推沿用输入影像的典型时间间隔，并使用历史气象统计作为后续气象假设。
- 界面训练误差反映拟合情况；独立预测能力需要按时间划分留出数据进行检验。

## 扩展模块与原有说明

研究工作台相关代码位于 `server/research-*`、`server/jiuwen-runtime.js` 和 `services/research`。原有八阶段工作流、截图和设计说明保留在 README 及 [详细技术文档](FloraCast_Deep_Research_Agent_Technical_Specification.md) 中。

新增数据源时，优先沿用现有连接器方式，记录原始值、单位、日期、空间范围、许可与失败状态。开发和审核流程见 [贡献指南](../CONTRIBUTING.md)。
