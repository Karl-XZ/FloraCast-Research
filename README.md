---
domain:
- cv
- multi-modal
tags:
- geoai
- remote-sensing
- phenology
- vegetation
- qwen
- cesium
datasets:
  evaluation:
  test:
  train:
models:
license: MIT
---

# FloraCast 3D GeoAI China Edition

FloraCast 3D is an open-source GeoAI web application for phenology monitoring, vegetation condition exploration, biodiversity observations, and plant-image assisted identification on a 3D globe.

This China-oriented edition is prepared for the Open Source GeoAI Practice Challenge. It keeps the interactive Studio-style experience while replacing browser-side closed API usage with a server-side Qwen-compatible proxy and a China-friendly base map.

## What Changed

- Default base map: Gaode/Amap vector tiles.
- Default location: Qingdao, China, the AP-GARSS 2026 host city.
- AI Assistant: browser no longer contains API keys; requests go through `/api/ai/chat`.
- Plant ID: Plant.id and Pl@ntNet paths were removed; image identification goes through `/api/plant/identify` and a Qwen-VL compatible endpoint.
- Geocoding: reverse lookup uses `/api/geocode/reverse` with optional `AMAP_WEB_KEY`, falling back to coordinates if no key is configured.
- Environment handling: `.env.example` is only a template and is no longer loaded as a fallback secret source.
- Repository hygiene: `node_modules` is ignored and should not be committed.

## Core Features

- 3D globe visualization through CesiumJS.
- Gaode/Amap domestic base map with optional NASA GIBS remote-sensing overlays.
- Dual-map split comparison for different satellite layers or dates.
- NDVI/EVI charts from MODIS/VIIRS data.
- Phenology estimation from NASA POWER daily weather data.
- Weather charts from NASA POWER.
- iNaturalist observation overlays for biodiversity context.
- Browser-side NDVI/EVI forecasting using TensorFlow.js, with a linear fallback.
- Qwen-powered agronomy and phenology assistant.
- Qwen-VL compatible plant image identification.

## Quick Start

Install Node.js 18 or later.

```bash
cd server
npm install
npm start
```

Open:

```text
http://localhost:5173
```

## Environment Variables

Copy `.env.example` to `.env` and fill in your deployment values.

```bash
QWEN_API_KEY=your-key
QWEN_API_BASE=https://llm-eln0cv2uifxjokf2.cn-beijing.maas.aliyuncs.com/compatible-mode/v1
QWEN_TEXT_MODEL=qwen-plus
QWEN_VISION_MODEL=qwen-vl-plus
AMAP_WEB_KEY=
PORT=5173
```

Do not commit `.env`.

## API Endpoints

```text
GET  /api/health
POST /api/ai/chat
GET  /api/geocode/reverse
POST /api/plant/identify
POST /api/plant/identify_url
```

The server keeps API keys out of the browser and normalizes Qwen/Qwen-VL responses for the frontend.

## Data and Resource Credits

- Gaode/Amap map tiles for domestic base map display.
- NASA GIBS for satellite imagery layers.
- NASA POWER for weather and phenology-related variables.
- iNaturalist for public biodiversity observation context.
- CesiumJS for 3D globe rendering.
- Plotly.js for charts.
- TensorFlow.js for browser-side forecasting.
- Qwen-compatible API endpoint for language and vision model inference.

## Open-Source Notes

This project is intended as a reproducible interactive GeoAI artifact. Keep code, deployment configuration, data sources, model names, and license information public wherever possible. Avoid relying on resources that reviewers cannot inspect or reproduce.

## License

MIT. See [LICENSE](LICENSE).
