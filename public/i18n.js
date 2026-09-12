/**
 * FloraCast Internationalization (i18n) Module
 * Supports seamless switching between pure English (default) and Chinese.
 * Persists selection via localStorage ('floracast_lang').
 */

const I18n = {
  currentLang: 'en',

  translations: {
    en: {
      // Menu
      'menu.title': 'Menu',
      'menu.layers': 'Layers & Base Maps',
      'menu.visualml': 'Visual Geo-ML',
      'menu.research': 'Research Multi-Agent',
      'menu.weather_search': 'Weather Search (Historical & Agent)',
      'menu.photos': 'Flower Photos',
      'menu.plantid': 'Plant ID (Conservation)',
      'menu.vegetation': 'Vegetation Index',
      'menu.phenology': 'Phenology',
      'menu.weather': 'Weather',
      'menu.workflow': 'GeoAI Workflow',
      'menu.patch': 'Patch Analysis',
      'menu.forecast': 'ML Forecast',
      'menu.ai': 'AI Assistant',
      'menu.lang_status': 'Language: English',
      'menu.lang_pill': 'Switch to 中文',

      // Loader
      'loader.text': 'Loading 3D Globe & Map Resources...',
      'loader.loading_base': 'Loading {name} tiles...',

      // Weather Search & Climate Agent
      'ws.header_title': 'Historical Weather Search & Research Agent',
      'ws.tab_search': 'Natural Language Weather Search',
      'ws.tab_agent': 'Climate Research Agent Mode',
      'ws.search_note': 'Based on 40-year NASA POWER daily meteorological series and 7/14/30-day sliding window algorithms, DeepSeek extracts multi-variable preferences and weights to retrieve extreme analog events in seconds.',
      'ws.query_label': 'Natural Language Weather Query',
      'ws.query_placeholder': 'e.g. Find 2-week period in Qingdao over past 30 years with abnormal heat and drought...',
      'ws.query_default': 'Find 2-week period in Qingdao over past 30 years with abnormal heat and drought',
      'ws.quick_prompts': 'Quick Prompts:',
      'ws.pill_1': 'Qingdao Summer Heatwave & Drought',
      'ws.pill_2': 'Sichuan 2022 Heatwave Analog',
      'ws.pill_3': 'Chengdu Winter Persistent Rain',
      'ws.pill_4': 'Beijing Spring Dry & Gale',
      'ws.topk_label': 'Return Candidate Events (Top-K)',
      'ws.topk_4': 'Top 4 Events',
      'ws.topk_6': 'Top 6 Events',
      'ws.topk_8': 'Top 8 Events',
      'ws.action_label': 'Action',
      'ws.search_btn': 'Search Historical Events',
      'ws.searching_text': 'DeepSeek is parsing query conditions and scanning 40-year sliding windows...',
      'ws.parsed_title': 'DeepSeek Structured Conditions Analysis',
      'ws.parsed_target': 'Target Area',
      'ws.parsed_timerange': 'Time Span',
      'ws.parsed_window': 'Event Window',
      'ws.parsed_constraints': 'Constraints',
      'ws.chart_section_title': 'Daily Multi-Element Time Series',
      'ws.veg_section_title': 'MODIS/VIIRS Vegetation Greenness Response Before & After Event',
      'ws.collapse': 'Collapse',
      'ws.results_title': 'Ranked Historical Events (Top-K)',
      'ws.results_count': 'Found {count} matching events',
      'ws.similarity': 'Similarity',
      'ws.days': 'days',
      'ws.year': 'Year',
      'ws.season_summer': 'Summer',
      'ws.season_spring': 'Spring',
      'ws.season_autumn': 'Autumn',
      'ws.season_winter': 'Winter',
      'ws.metric_mean_t': 'Mean Temp',
      'ws.metric_max_t': 'Max Temp',
      'ws.metric_total_precip': 'Total Precip',
      'ws.metric_dry_days': 'Dry Days',
      'ws.metric_solar_rad': 'Solar Rad',
      'ws.metric_temp_slope': 'Temp Slope',
      'ws.z_temp': 'Z(Temp)',
      'ws.z_precip': 'Z(Precip)',
      'ws.z_radiation': 'Z(Radiation)',
      'ws.btn_locate': 'Locate Area & Satellite Base',
      'ws.btn_chart': 'Daily Factor Curves',
      'ws.btn_veg': 'Vegetation Response',
      'ws.veg_pre_avg': 'Pre-event Baseline',
      'ws.veg_dur_avg': 'Event Period Mean',
      'ws.veg_delta': 'ΔNDVI',
      'ws.veg_impact': 'Impact Assessment',
      'ws.veg_trace_daily': 'Daily NDVI Dynamics',
      'ws.veg_trace_baseline': 'Climatological Baseline',
      'ws.chart_t2m': 'Daily Mean Temp (°C)',
      'ws.chart_tmax': 'Daily Max Temp (°C)',
      'ws.chart_sol': 'Shortwave Rad (MJ/m²)',
      'ws.chart_precip': 'Precipitation (mm)',
      'ws.chart_y1_title': 'Temp (°C) / Rad (MJ)',
      'ws.chart_y2_title': 'Precipitation (mm)',
      'ws.sev_vigorous': 'Vigorous Growth',
      'ws.sev_favorable': 'Favorable Hydrothermal',
      'ws.sev_severe_drought': 'Severe Drought',
      'ws.sev_mod_drought': 'Moderate Drought',
      'ws.sev_frost': 'Frost Stress',
      'ws.sev_waterlog': 'Waterlogging Stress',
      'ws.sev_stable': 'Stable Baseline',

      // Climate Agent Sub-Keys
      'ws.agent_note': 'Climate Research Agent autonomously runs full workflow: Multi-dimensional weather search -> Cross-event indicator comparison -> MODIS vegetation damage analysis (ΔNDVI) -> DeepSeek academic synthesis.',
      'ws.agent_question_label': 'Complex Scientific Research Question / Hypothesis',
      'ws.agent_question_placeholder': 'Enter complex weather and ecological research question...',
      'ws.agent_question_default': 'Find historical events most similar to the 2022 Sichuan-Chongqing extreme heatwave and evaluate MODIS vegetation resilience',
      'ws.agent_prompts': 'Recommended Topics:',
      'ws.agent_pill_1': 'Sichuan-Chongqing 2022 Heatwave Analog & NDVI Impact',
      'ws.agent_pill_2': 'North China Plain 30-Year Summer Drought Comparison',
      'ws.agent_run_btn': 'Run Climate Agent Deep Inference',
      'ws.agent_stage_1': 'Task Planning',
      'ws.agent_stage_2': 'Weather Search',
      'ws.agent_stage_3': 'Temporal Compare',
      'ws.agent_stage_4': 'Vegetation Response',
      'ws.agent_stage_5': 'Academic Synthesis',
      'ws.agent_thinking_header': 'Agent Real-time Reasoning & Tool Call Stream',
      'ws.agent_thinking_default': 'Scheduling meteorological and remote sensing toolchains...',
      'ws.agent_matrix_title': 'Cross-Event Extreme Meteorology & Vegetation Loss Matrix',
      'ws.agent_col_year': 'Event Year',
      'ws.agent_col_dates': 'Time Window',
      'ws.agent_col_meant': 'Mean Temp',
      'ws.agent_col_maxt': 'Max Temp',
      'ws.agent_col_cdd': 'Dry Days',
      'ws.agent_col_delta': 'ΔNDVI',
      'ws.agent_col_loss': 'Vegetation Change',
      'ws.agent_col_recov': 'Recovery Period',
      'ws.agent_report_title': 'DeepSeek Meteorological Attribution & Ecological Response Report',
      'ws.agent_copy_report': 'Copy Report',

      // Visual Geo-ML
      'vml.header_title': 'Visual Geo-ML (Spatial Machine Learning Lab)',
      'vml.tab_knn': '1. Spatial Decision Boundary (KNN/SVM)',
      'vml.tab_nn': '2. Neural Network Flow & Attribution',
      'vml.knn_note': 'Project eco-climatic factors (temperature, precipitation, vegetation) into classification decision surfaces on the 3D globe. Adjust hyperparameters to observe decision boundary warping in real time.',
      'vml.task_label': 'Classification Task Mode',
      'vml.opt_eco': 'Eco-Climatic Zones: T2M × Precip',
      'vml.opt_species': 'Flora Species Spatial Niches',
      'vml.opt_synthetic': 'Synthetic Nonlinear Manifold',
      'vml.model_label': 'Algorithm Model',
      'vml.model_knn': 'K-Nearest Neighbors (KNN)',
      'vml.model_svm': 'Kernel SVM (Gaussian RBF)',
      'vml.param_label': 'KNN K-Value / Parameter:',
      'vml.metric_label': 'Distance Metric',
      'vml.metric_euclidean': 'Euclidean Distance',
      'vml.metric_spherical': 'Spherical Great-Circle Distance (Haversine)',
      'vml.btn_run': 'Compute & Render 3D Decision Surface',
      'vml.btn_clear': 'Clear Overlay',
      'vml.status_ready': 'Ready. Click button above to generate decision surface and feature space projection.',
      'vml.chart_hint': 'Chart displays feature space decision boundaries. Click scatter points to fly to 3D coordinates.',
      'vml.nn_note': 'Architecture topology and forward propagation activation flow of on-device 30-day forecast neural network. Displays dynamic neuron firing and feature saliency attribution based on local climate.',
      'vml.btn_animate': 'Activate Forward Propagation Animation',
      'vml.btn_saliency': 'Compute Feature Attribution Weights',
      'vml.saliency_hint': 'Feature attribution bar chart reflects forecast sensitivity to temperature, precipitation, seasonality, and vegetation memory.',

      // Research Multi-Agent
      'ra.header_title': 'Research Multi-Agent (openJiuwen + DeepSeek)',
      'ra.note': 'Powered by Huawei openJiuwen 8-stage deterministic workflow and DeepSeek (deepseek-flash) long-context reasoning. Enter a topic to autonomously coordinate agents for protocol definition, literature mining, spatial QA, and academic report writing.',
      'ra.q_label': 'Research Question / Scientific Hypothesis',
      'ra.q_placeholder': 'e.g. Analyze driving effects and uncertainty of spring temperature rise on woody plant first flowering date over the past 5 years...',
      'ra.q_default': 'Study on Chengdu 2026 Haze Trends: Formation, evolution and prediction based on thermal inversion, basin topography barrier and multi-source remote sensing',
      'ra.start_year': 'Start Year',
      'ra.end_year': 'End Year',
      'ra.radius': 'Study Radius (km)',
      'ra.mode_label': 'Data Mode',
      'ra.mode_live': 'Live Public Data (NASA + MODIS)',
      'ra.mode_demo': 'Fixed Test Benchmark Data',
      'ra.btn_run': 'Launch Research Multi-Agent Workflow',
      'ra.btn_workbench': 'Open Dedicated Workbench ↗',
      'ra.status_ready': 'Ready. Configure question above to launch multi-agent collaboration.',
      'ra.stage_1': 'Protocol Definition',
      'ra.stage_2': 'Literature Search',
      'ra.stage_3': 'Data Registry',
      'ra.stage_4': 'Spatial Analysis',
      'ra.stage_5': 'Statistical Verification',
      'ra.stage_6': 'Evidence Review',
      'ra.stage_7': 'Independent Reproduction',
      'ra.stage_8': 'Academic Report',
      'ra.thinking_title': 'DeepSeek Reasoning Stream',
      'ra.thinking_default': 'Thinking...',
      'ra.report_title': 'Final Academic Research Report',
      'ra.copy_report': 'Copy Report',
      'ra.copied': 'Copied!',
      'ra.alert_empty': 'Please enter a research question or hypothesis.',
      'ra.status_init': 'Building frozen protocol & launching openJiuwen multi-agent engine...',
      'ra.thinking_init': 'Establishing session with Huawei openJiuwen 8-stage pipeline, initializing DeepSeek reasoning...',
      'ra.region_label': 'Region',
      'ra.status_running': 'Multi-agent inference in progress (Task ID: ',
      'ra.err_connect': 'Failed to connect to backend service (5174). If service terminated, run start_server.bat or refresh.',
      'ra.err_start': 'Launch failed: ',
      'ra.p_protocol': 'Agent 01: Generating structured research protocol, establishing causal estimand and audit rules...',
      'ra.p_literature': 'Agent 02: Searching Europe PMC, arXiv and CrossRef for related phenological literature...',
      'ra.p_data': 'Agent 03: Synchronizing NASA POWER weather and MODIS surface reflectance series...',
      'ra.p_geo': 'Agent 04: Performing remote sensing cloud masking, land cover filtering and spatial QC...',
      'ra.p_statistics': 'Agent 05: Fitting GDD thermal response curves and Sen\'s slope trend test...',
      'ra.p_evidence': 'Agent 06: Cross-auditing phenological and meteorological evidence chains...',
      'ra.p_reproduce': 'Agent 07: Computing SHA-256 hash snapshots for independent reproducibility verification...',
      'ra.p_report': 'Agent 08: Calling DeepSeek reasoning model to synthesize evidence into academic report...',
      'ra.stage_current': 'Current Stage: ',
      'ra.status_done': 'Inference complete! 8-stage multi-agent research report generated (Audit SHA-256: ',
      'ra.audit_summary': 'Full 8-stage inference and audit verification completed.<br>- Protocol Audit: {status}<br>- Literature: {count} citations<br>- Pixel QC: Passed<br>- Reproducibility: Hash snapshot verified.',
      'ra.status_err': 'Inference error: ',

      // Dynamic Weather Search & Climate Agent
      'ws.alert_empty_query': 'Please enter a historical weather query',
      'ws.alert_search_error': 'Search error: ',
      'ws.location_default': 'Study Area',
      'ws.target_area_default': 'Target Area',
      'ws.window_desc': 'Continuous {days}-day sliding window ({total} candidate windows scanned in 40-year series)',
      'ws.cond_temp': 'Temp:',
      'ws.cond_precip': 'Precip:',
      'ws.cond_rad': 'Rad:',
      'ws.cond_balanced': 'Balanced multi-factor constraints',
      'ws.summary_default': 'Successfully parsed structured search intent and evaluated similarity across spatiotemporal sliding series.',
      'ws.veg_loading': 'Retrieving MODIS vegetation index inversion...',
      'ws.veg_error': 'Vegetation inversion failed: ',
      'ws.chart_title_dates': 'Daily Meteorological Factors ({start} ~ {end})',
      'ws.agent_alert_empty': 'Please enter a research question or hypothesis',
      'ws.agent_init_plan': '[Climate Agent] Initializing multi-step autonomous research plan...\n',
      'ws.agent_stage1_log': '• [Stage 1: Planning] Parse spatiotemporal constraints, similarity space & vegetation inversion chain\n',
      'ws.agent_stage2_log': '• [Stage 2: Weather Search] Query 40-year NASA POWER series, sliding window & Z-score\n',
      'ws.agent_stage3_log': '• [Stage 3: Temporal Compare] Attribute temperature extremes, heat accumulation & CDD\n',
      'ws.agent_stage4_log': '• [Stage 4: Vegetation] Invert ±15-day MODIS NDVI anomaly & damage proportion for candidate events\n',
      'ws.agent_stage5_log': '• [Stage 5: Synthesis] Call DeepSeek for academic reasoning synthesis & report generation...\n',
      'ws.agent_done_stream': 'Inference workflow completed.',
      'ws.agent_report_done': 'Academic research report generated.',
      'ws.agent_error_prefix': 'Agent inference failed: ',
      'ws.agent_copied': 'Report copied to clipboard!',
      'ws.agent_copy_fail': 'Failed to copy, please copy manually.',

      // Dynamic Visual Geo-ML
      'vml.kernel_label': 'Gaussian RBF γ = ',
      'vml.status_computing': 'Computing spatial ML decision surface & feature projections...',
      'vml.eco_zone_a': 'Eco-climatic Zone A (Warm & Humid)',
      'vml.eco_zone_b': 'Eco-climatic Zone B (Cold & Dry)',
      'vml.eco_zone_c': 'Transitional Ecocline',
      'vml.species_a': 'Winter Jasmine / Wild Peach (Early Spring Cold-Hardy)',
      'vml.species_b': 'Forsythia / Cherry Blossom (Mid Spring Mesic)',
      'vml.species_c': 'Black Locust / Goldenrain Tree (Summer Deep-Rooted)',
      'vml.manifold_a': 'Manifold Class A (Primary Spiral)',
      'vml.manifold_b': 'Manifold Class B (Secondary Spiral)',
      'vml.rendered_status': 'Rendered <strong>{pixels}</strong> decision pixels and <strong>{samples}</strong> samples on 3D globe.',
      'vml.cleared_status': 'Cleared decision surface overlay from map & feature space.',
      'vml.feat_temp': 'Feature 1: Temperature (°C)',
      'vml.feat_precip': 'Feature 2: Precipitation (mm)',
      'vml.saliency_axis': 'Feature Saliency Attribution Contribution (%)',
      'vml.sal_frost': 'Extreme Temp Inversion (Frost Risk)',
      'vml.sal_doy': 'Seasonal Harmonic (DOY Harmonic)',
      'vml.sal_ndvi': 'Vegetation Memory (NDVI Lag)',
      'vml.sal_precip': 'Precip & Moisture',
      'vml.sal_gdd': 'Effective Growing Degree Days (GDD / T2M)',

      // Providers
      'provider.amap': 'Amap Vector',
      'provider.baidu_vec': 'Baidu Vector',
      'provider.baidu_sat': 'Baidu Satellite',
      'provider.tianditu_sat': 'Tianditu Satellite',
      'provider.osm': 'OpenStreetMap',
      'provider.base': 'Base Map',

      // Layers Panel
      'layers.base_map': 'Base Map Provider',
      'layers.opt_amap': 'Amap Vector (Default)',
      'layers.opt_baidu_vec': 'Baidu Vector (BD-09)',
      'layers.opt_baidu_sat': 'Baidu Satellite',
      'layers.opt_tianditu_sat': 'Tianditu Global Satellite',
      'layers.opt_osm': 'OpenStreetMap Vector',
      'layers.base_map_hint': 'Seamless switching between Amap, Baidu (BD-09 offset-corrected) and Tianditu.',
      'layers.opg_hint': 'GFS Numerical Forecast (0h~72h forward steps; forecast data does not change with historical date)',
      'layers.gibs_hint': 'NASA GIBS Remote Sensing Layers (LST, NDVI, True Color, etc.) are indexed daily from real satellite archives.'
    },

    zh: {
      // Menu
      'menu.title': '菜单导航',
      'menu.layers': '图层与底图',
      'menu.visualml': 'Visual Geo-ML (机器学习可视化)',
      'menu.research': '科研智能体协作',
      'menu.weather_search': 'Weather Search (历史气象搜索与Agent)',
      'menu.photos': '花卉照片',
      'menu.plantid': '植物物种识别',
      'menu.vegetation': '植被指数',
      'menu.phenology': '物候分析',
      'menu.weather': '实时气象',
      'menu.workflow': 'GeoAI 工作流',
      'menu.patch': '样带斑块分析',
      'menu.forecast': '机器学习预测',
      'menu.ai': 'AI 助手',
      'menu.lang_status': '当前语言：中文',
      'menu.lang_pill': '切换为 English',

      // Loader
      'loader.text': '3D地球与底图资源加载中...',
      'loader.loading_base': '正在加载{name}资源...',

      // Weather Search & Climate Agent
      'ws.header_title': '历史气象搜索与科研 Agent',
      'ws.tab_search': '自然语言历史气象检索',
      'ws.tab_agent': 'Climate Research Agent 模式',
      'ws.search_note': '基于 40 年 NASA POWER 气象日序列与 7/14/30 天滑动窗口算法，利用 DeepSeek 提取多变量偏好与权重，在气象基准向量库中秒级检索极端相似事件。',
      'ws.query_label': '自然语言气象查询',
      'ws.query_placeholder': '例如：寻找青岛过去30年夏季持续两周异常高温少雨时期...',
      'ws.query_default': '寻找青岛过去30年夏季持续两周异常高温少雨时期',
      'ws.quick_prompts': '快速体验:',
      'ws.pill_1': '青岛夏季高温少雨',
      'ws.pill_2': '川渝2022热浪相似',
      'ws.pill_3': '成都冬季连阴雨',
      'ws.pill_4': '北京春季干燥大风',
      'ws.topk_label': '返回候选事件数 (Top-K)',
      'ws.topk_4': 'Top 4 事件',
      'ws.topk_6': 'Top 6 事件',
      'ws.topk_8': 'Top 8 事件',
      'ws.action_label': '操作',
      'ws.search_btn': '检索历史事件',
      'ws.searching_text': 'DeepSeek 正在解析自然语言条件并比对 40 年滑动窗口...',
      'ws.parsed_title': 'DeepSeek 结构化条件解析',
      'ws.parsed_target': '目标区域',
      'ws.parsed_timerange': '时间跨度',
      'ws.parsed_window': '事件窗口',
      'ws.parsed_constraints': '约束倾向',
      'ws.chart_section_title': '逐日多要素时序曲线',
      'ws.veg_section_title': '事件前后 MODIS/VIIRS 植被绿度响应',
      'ws.collapse': '收起',
      'ws.results_title': '相似历史事件排序 (Top-K)',
      'ws.results_count': '共检索到 {count} 个契合事件',
      'ws.similarity': '相似度',
      'ws.days': '天',
      'ws.year': '年',
      'ws.season_summer': '夏季',
      'ws.season_spring': '春季',
      'ws.season_autumn': '秋季',
      'ws.season_winter': '冬季',
      'ws.metric_mean_t': '日均气温',
      'ws.metric_max_t': '最高气温',
      'ws.metric_total_precip': '降水总量',
      'ws.metric_dry_days': '连旱天数',
      'ws.metric_solar_rad': '太阳辐射',
      'ws.metric_temp_slope': '温升速率',
      'ws.z_temp': 'Z(气温)',
      'ws.z_precip': 'Z(降水)',
      'ws.z_radiation': 'Z(辐射)',
      'ws.btn_locate': '定位区域与卫星底图',
      'ws.btn_chart': '逐日要素曲线',
      'ws.btn_veg': '植被绿度响应',
      'ws.veg_pre_avg': '事件前基准',
      'ws.veg_dur_avg': '事件期均值',
      'ws.veg_delta': 'ΔNDVI',
      'ws.veg_impact': '影响判定',
      'ws.veg_trace_daily': '逐日 NDVI 动态',
      'ws.veg_trace_baseline': '气候态常年基线',
      'ws.chart_t2m': '日均温(°C)',
      'ws.chart_tmax': '最高温(°C)',
      'ws.chart_sol': '短波辐射(MJ/m²)',
      'ws.chart_precip': '降水量(mm)',
      'ws.chart_y1_title': '温度 (°C) / 辐射 (MJ)',
      'ws.chart_y2_title': '降水 (mm)',
      'ws.sev_vigorous': '水热旺盛生长 (Vigorous Growth)',
      'ws.sev_favorable': '雨热良性促进 (Favorable Hydrothermal)',
      'ws.sev_severe_drought': '严重干旱萎蔫 (Severe Drought)',
      'ws.sev_mod_drought': '中度水分胁迫 (Moderate Drought)',
      'ws.sev_frost': '低温冻害受挫 (Cold Frost)',
      'ws.sev_waterlog': '短时水渍寡照 (Waterlogging Stress)',
      'ws.sev_stable': '常态平稳波动 (Stable Baseline)',

      // Climate Agent Sub-Keys
      'ws.agent_note': 'Climate Research Agent 自主执行「多维气象相似检索 → 跨事件多指标比对 → MODIS植被受损反演(ΔNDVI) → DeepSeek 学术报告综合」全流程。',
      'ws.agent_question_label': '复杂科研课题 / 科学假设',
      'ws.agent_question_placeholder': '输入复杂的历史气象与生态关联课题...',
      'ws.agent_question_default': '寻找与2022年川渝极端热浪最相似的历史事件，并评估MODIS植被恢复能力',
      'ws.agent_prompts': '推荐课题:',
      'ws.agent_pill_1': '寻找与2022年川渝极端热浪最相似的历史事件，并评估MODIS植被恢复能力',
      'ws.agent_pill_2': '对比华北平原过去30年典型夏伏旱时期的水热异常与生态弹性',
      'ws.agent_run_btn': '启动 Climate Agent 深度推演',
      'ws.agent_stage_1': '任务规划',
      'ws.agent_stage_2': '气象检索',
      'ws.agent_stage_3': '时序比对',
      'ws.agent_stage_4': '植被响应',
      'ws.agent_stage_5': '科研综合',
      'ws.agent_thinking_header': 'Agent 实时推演与工具调用流',
      'ws.agent_thinking_default': '正在调度气象与遥感工具链...',
      'ws.agent_matrix_title': '多事件极端气象与植被损耗横向矩阵',
      'ws.agent_col_year': '事件年份',
      'ws.agent_col_dates': '时间窗口',
      'ws.agent_col_meant': '平均气温',
      'ws.agent_col_maxt': '极端最高温',
      'ws.agent_col_cdd': '连旱天数',
      'ws.agent_col_delta': 'ΔNDVI',
      'ws.agent_col_loss': '植被损失率',
      'ws.agent_col_recov': '恢复期',
      'ws.agent_report_title': 'DeepSeek 气象归因与生态响应学术报告',
      'ws.agent_copy_report': '复制全文',

      // Visual Geo-ML
      'vml.header_title': 'Visual Geo-ML (空间机器学习实验室)',
      'vml.tab_knn': '1. 空间决策边界 (KNN/SVM)',
      'vml.tab_nn': '2. 神经网络流场与归因',
      'vml.knn_note': '在 3D 地球表面将生态气候因子（气温、降水、植被）投射为分类决策面。联动调节超参数可实时观察地理空间与特征空间的决策边界形变。',
      'vml.task_label': '分类任务模式',
      'vml.opt_eco': '生态气候适生区判别 (Eco-Climatic Zones: T2M × Precip)',
      'vml.opt_species': '周边代表性物种空间生态位 (Flora Species Spatial Niches)',
      'vml.opt_synthetic': '双模态非线性螺旋流形测试 (Synthetic Nonlinear Manifold)',
      'vml.model_label': '算法模型',
      'vml.model_knn': 'K-Nearest Neighbors (KNN)',
      'vml.model_svm': 'Kernel SVM (高斯核支持向量机)',
      'vml.param_label': 'KNN K值 / 参数:',
      'vml.metric_label': '距离度量',
      'vml.metric_euclidean': '欧氏距离 (Euclidean)',
      'vml.metric_spherical': '球面大圆距离 (Haversine)',
      'vml.btn_run': '计算并绘制 3D 决策面',
      'vml.btn_clear': '清除覆盖层',
      'vml.status_ready': '就绪。点击上方按钮在当前区域生成决策面与特征空间投影。',
      'vml.chart_hint': '上图展示特征空间决策边界。点击散点可快速定位到 3D 地球坐标。',
      'vml.nn_note': '端侧 30 天预测神经网络的架构拓扑与前向传播激活流场。基于当前位置的气候因子展示神经元动态放电与显著性特征归因。',
      'vml.btn_animate': '激活前向传播动画',
      'vml.btn_saliency': '计算特征归因权重',
      'vml.saliency_hint': '特征归因柱状图反映当前预测受气温、降水、季节节律与植被历史记忆的敏感度分布。',

      // Research Multi-Agent
      'ra.header_title': '科研 Agent 协作 (openJiuwen + DeepSeek)',
      'ra.note': '依托华为 openJiuwen 8 阶段确定性工作流与 DeepSeek (deepseek-flash) 长思维链模型，输入科研主题即可自动调度多智能体完成协议确立、文献挖掘、空间质控与学术报告撰写。',
      'ra.q_label': '研究问题 / 科学假设',
      'ra.q_placeholder': '例如：分析该区域近五年春季气温升高对典型木本植物始花期的驱动效应与不确定性...',
      'ra.q_default': '预测成都2026雾霾情况研究：基于气象逆温层、盆地地形阻滞与多源数据的生消演变规律及趋势预测',
      'ra.start_year': '开始年份',
      'ra.end_year': '结束年份',
      'ra.radius': '研究区半径 (km)',
      'ra.mode_label': '数据模式',
      'ra.mode_live': '实时公开数据 (NASA + MODIS)',
      'ra.mode_demo': '固定测试基准数据',
      'ra.btn_run': '启动科研 Agent 推演',
      'ra.btn_workbench': '打开独立工作台 ↗',
      'ra.status_ready': '就绪。配置科学问题后启动多智能体协作。',
      'ra.stage_1': '协议确立',
      'ra.stage_2': '文献检索',
      'ra.stage_3': '数据登记',
      'ra.stage_4': '空间分析',
      'ra.stage_5': '统计验证',
      'ra.stage_6': '证据审查',
      'ra.stage_7': '独立复现',
      'ra.stage_8': '学术报告',
      'ra.thinking_title': 'DeepSeek 思考推理流 (Reasoning Stream)',
      'ra.thinking_default': '思考中...',
      'ra.report_title': '最终学术研究报告',
      'ra.copy_report': '复制报告',
      'ra.copied': '已复制！',
      'ra.alert_empty': '请输入研究问题或科学假设。',
      'ra.status_init': '正在构建冻结协议并启动 openJiuwen 多智能体调度引擎...',
      'ra.thinking_init': '正在与华为 openJiuwen 8 阶段流水线建立会话，准备启动 DeepSeek 思考链路...',
      'ra.region_label': '区域',
      'ra.status_running': '多智能体推演中 (任务 ID: ',
      'ra.err_connect': '连接后台服务失败 (5174)。若服务意外关闭，请双击项目根目录 start_server.bat 重新启动，或刷新重试。',
      'ra.err_start': '启动失败: ',
      'ra.p_protocol': '智能体 01: 正在生成结构化科研计划、确立因果 estimand 与审计规则...',
      'ra.p_literature': '智能体 02: 正在检索 Europe PMC、arXiv 及 CrossRef 相关生态物候学术文献...',
      'ra.p_data': '智能体 03: 正在同步 NASA POWER 气象与 MODIS 遥感反射率像元序列...',
      'ra.p_geo': '智能体 04: 正在执行遥感像元云掩膜、地表覆盖过滤与空间质控验证...',
      'ra.p_statistics': '智能体 05: 正在拟合积温 GDD 响应曲线与 Sen\'s 斜率稳健趋势检验...',
      'ra.p_evidence': '智能体 06: 正在交叉审查物候与气候观测证据链，拦截过度推断...',
      'ra.p_reproduce': '智能体 07: 正在计算 SHA-256 输入/输出快照哈希，完成独立复现核验...',
      'ra.p_report': '智能体 08: 正在调用 DeepSeek 深度思考模型，综合多源证据撰写严谨学术报告...',
      'ra.stage_current': '当前阶段: ',
      'ra.status_done': '推演完成！ 8 阶段多智能体学术研究报告已生成 (SHA-256 审计哈希: ',
      'ra.audit_summary': '已完成全链路 8 阶段推演与严格审计检验。<br>- 协议审计: {status}<br>- 文献检索: {count} 篇文献支撑<br>- 像元质控: 通过<br>- 独立复现性: 经计算输入/输出哈希与幂等性校验一致。',
      'ra.status_err': '推演异常: ',

      // Dynamic Weather Search & Climate Agent
      'ws.alert_empty_query': '请输入历史气象查询语句',
      'ws.alert_search_error': '检索出错: ',
      'ws.location_default': '研究区',
      'ws.target_area_default': '目标区域',
      'ws.window_desc': '持续 {days} 天滑动窗口 (共比对 40 年 {total} 个候选窗口)',
      'ws.cond_temp': '气温:',
      'ws.cond_precip': '降水:',
      'ws.cond_rad': '辐射:',
      'ws.cond_balanced': '综合平衡约束',
      'ws.summary_default': '成功结构化解析查询意图并完成滑动时空序列相似性评分。',
      'ws.veg_loading': '正在调取 MODIS 植被指数反演差值...',
      'ws.veg_error': '反演失败: ',
      'ws.chart_title_dates': '逐日气象要素曲线 ({start} ~ {end})',
      'ws.agent_alert_empty': '请输入科研课题或假设',
      'ws.agent_init_plan': '[Climate Agent] 正在初始化多步骤自主科研规划...\n',
      'ws.agent_stage1_log': '• [Stage 1: 任务规划] 解析时空约束、相似度向量空间与植被反演链路\n',
      'ws.agent_stage2_log': '• [Stage 2: 气象检索] 调用 NASA POWER 40年序列，执行多维滑动窗口检索与Z-score归一化\n',
      'ws.agent_stage3_log': '• [Stage 3: 时序比对] 完成极值温差、热量累积与连续干旱天数(CDD)时序归因\n',
      'ws.agent_stage4_log': '• [Stage 4: 植被响应] 反演候选事件前后各15天 MODIS NDVI 差值与受损比例\n',
      'ws.agent_stage5_log': '• [Stage 5: 科研综合] 调用 DeepSeek 进行逻辑综合与学术论述生成...\n',
      'ws.agent_done_stream': '任务推演完成。',
      'ws.agent_report_done': '学术报告撰写完成。',
      'ws.agent_error_prefix': 'Agent 推演失败: ',
      'ws.agent_copied': '学术报告已复制到剪贴板！',
      'ws.agent_copy_fail': '复制失败，请手动复制。',

      // Dynamic Visual Geo-ML
      'vml.kernel_label': '高斯核 γ = ',
      'vml.status_computing': '正在计算空间机器学习决策面与特征投影...',
      'vml.eco_zone_a': '高温湿润适生带 (喜暖湿)',
      'vml.eco_zone_b': '寒温干旱耐受带 (耐寒干)',
      'vml.eco_zone_c': '温性过渡生态交错带',
      'vml.species_a': '迎春/山桃 (早春耐寒群落)',
      'vml.species_b': '连翘/樱花 (仲春喜温群落)',
      'vml.species_c': '刺槐/栾树 (夏秋深根群落)',
      'vml.manifold_a': '流形类别 A (螺旋主支)',
      'vml.manifold_b': '流形类别 B (螺旋副支)',
      'vml.rendered_status': '已在 3D 地球渲染 <strong>{pixels}</strong> 个分类决策面像元与 <strong>{samples}</strong> 个观测样本。',
      'vml.cleared_status': '已清除地图与特征空间决策面覆盖层。',
      'vml.feat_temp': '特征 1: 气温 (°C)',
      'vml.feat_precip': '特征 2: 降水 (mm)',
      'vml.saliency_axis': '特征显著性归因贡献率 (%)',
      'vml.sal_frost': '极端逆温扰动 (Frost Risk)',
      'vml.sal_doy': '季节节律编码 (DOY Harmonic)',
      'vml.sal_ndvi': '植被指数历史记忆 (NDVI Lag)',
      'vml.sal_precip': '降水与地表湿度 (Precip/Moisture)',
      'vml.sal_gdd': '有效积温累积 (GDD / T2M)',

      // Providers
      'provider.amap': '高德矢量地图',
      'provider.baidu_vec': '百度矢量地图',
      'provider.baidu_sat': '百度卫星影像',
      'provider.tianditu_sat': '天地图卫星',
      'provider.osm': 'OpenStreetMap',
      'provider.base': '底图',

      // Layers Panel
      'layers.base_map': 'Base Map · 底图提供商',
      'layers.opt_amap': '高德矢量底图 (Amap Vector - 默认)',
      'layers.opt_baidu_vec': '百度矢量底图 (Baidu Vector - BD-09)',
      'layers.opt_baidu_sat': '百度卫星影像 (Baidu Satellite)',
      'layers.opt_tianditu_sat': '天地图全球卫星 (Tianditu Satellite)',
      'layers.opt_osm': 'OpenStreetMap 矢量地图',
      'layers.base_map_hint': '支持国内高德、百度（BD-09纠偏）与天地图自由切换。',
      'layers.opg_hint': 'GFS 数值预报 (0h~72h 为未来时效，无历史归档，不随历史日期变动)',
      'layers.gibs_hint': 'NASA 遥感图层（地表温度 LST、NDVI、真彩色等）支持按真实卫星归档逐日回溯。'
    }
  },

  init() {
    const saved = localStorage.getItem('floracast_lang');
    if (saved === 'zh' || saved === 'en') {
      this.currentLang = saved;
    } else {
      this.currentLang = 'en'; // Default to pure English as requested
    }
    this.applyToDOM();
  },

  getCurrentLang() {
    return this.currentLang;
  },

  t(key, fallback = '', params = {}) {
    const dict = this.translations[this.currentLang] || this.translations.en;
    let str = (dict && dict[key] !== undefined) ? dict[key] : (this.translations.en && this.translations.en[key] !== undefined ? this.translations.en[key] : (fallback || key));
    if (params && typeof params === 'object') {
      Object.keys(params).forEach(k => {
        str = str.replaceAll(`{${k}}`, params[k]);
      });
    }
    return str;
  },

  setLanguage(lang) {
    if (lang !== 'en' && lang !== 'zh') return;
    this.currentLang = lang;
    localStorage.setItem('floracast_lang', lang);
    document.documentElement.lang = lang;
    this.applyToDOM();

    // Trigger custom event for components
    window.dispatchEvent(new CustomEvent('floracast:languageChange', { detail: { lang } }));
  },

  toggle() {
    const next = this.currentLang === 'en' ? 'zh' : 'en';
    this.setLanguage(next);
  },

  applyToDOM() {
    document.documentElement.lang = this.currentLang;

    // Translate all elements with data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const val = this.t(key);
      if (val) {
        el.textContent = val;
      }
    });

    // Translate placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      const val = this.t(key);
      if (val) {
        el.placeholder = val;
      }
    });

    // Translate titles
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      const val = this.t(key);
      if (val) {
        el.title = val;
      }
    });

    // Update Language Toggle Button in Menu
    const statusEl = document.getElementById('lang-status-text');
    const pillEl = document.getElementById('lang-switch-pill');
    if (statusEl) statusEl.textContent = this.t('menu.lang_status');
    if (pillEl) pillEl.textContent = this.t('menu.lang_pill');
  }
};

window.I18n = I18n;
