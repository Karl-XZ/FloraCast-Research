/**
 * Sliding window feature engineering and multi-variable similarity scoring
 */
export function extractSlidingWindowEvents(rows, baseline, options = {}) {
  const windowDays = Math.max(5, Math.min(60, Number(options.windowDays || 14)));
  const stepDays = Math.max(1, Math.min(7, Number(options.stepDays || 2)));
  const minYear = options.startYear || 1985;
  const maxYear = options.endYear || 2024;
  const filterSeasons = Array.isArray(options.seasons) && options.seasons.length ? options.seasons : null;
  const filterMonths = Array.isArray(options.months) && options.months.length ? options.months : null;

  const events = [];

  for (let i = 0; i <= rows.length - windowDays; i += stepDays) {
    const chunk = rows.slice(i, i + windowDays);
    if (chunk.length < windowDays) continue;

    const startRow = chunk[0];
    const endRow = chunk[chunk.length - 1];
    const yr = startRow.year;

    if (yr < minYear || yr > maxYear) continue;

    // 数据完整度与连续性严格校验：排除包含空值、无效值(-999)或非连续日期的滑动窗口
    let hasMissing = false;
    for (let k = 0; k < chunk.length; k++) {
      const r = chunk[k];
      if (r.t2m == null || r.t2m <= -900 || isNaN(r.t2m)) { hasMissing = true; break; }
      if (r.t2m_max == null || r.t2m_max <= -900 || isNaN(r.t2m_max)) { hasMissing = true; break; }
      if (r.t2m_min == null || r.t2m_min <= -900 || isNaN(r.t2m_min)) { hasMissing = true; break; }
      if (r.prectotcorr == null || r.prectotcorr < 0 || isNaN(r.prectotcorr)) { hasMissing = true; break; }
      if (r.allsky_sfc_sw_dwn == null || r.allsky_sfc_sw_dwn <= 0 || r.allsky_sfc_sw_dwn <= -900 || isNaN(r.allsky_sfc_sw_dwn)) { hasMissing = true; break; }
    }
    if (hasMissing) continue;

    // 校验日期连续性
    let continuous = true;
    for (let k = 0; k < chunk.length - 1; k++) {
      const d1 = new Date(Date.UTC(parseInt(chunk[k].date.slice(0,4)), parseInt(chunk[k].date.slice(4,6))-1, parseInt(chunk[k].date.slice(6,8))));
      const d2 = new Date(Date.UTC(parseInt(chunk[k+1].date.slice(0,4)), parseInt(chunk[k+1].date.slice(4,6))-1, parseInt(chunk[k+1].date.slice(6,8))));
      if (Math.round((d2 - d1) / 86400000) !== 1) { continuous = false; break; }
    }
    if (!continuous) continue;

    const midDoy = chunk[Math.floor(chunk.length / 2)].doy;
    const midMonth = parseInt(chunk[Math.floor(chunk.length / 2)].date.slice(4, 6), 10);
    
    let season = 'spring';
    if (midMonth >= 3 && midMonth <= 5) season = 'spring';
    else if (midMonth >= 6 && midMonth <= 8) season = 'summer';
    else if (midMonth >= 9 && midMonth <= 11) season = 'autumn';
    else season = 'winter';

    if (filterSeasons && !filterSeasons.includes(season)) continue;
    if (filterMonths && !filterMonths.includes(midMonth)) continue;

    // Aggregate values
    let sumT = 0, maxT = -999, minT = 999;
    let sumPrecip = 0, consecutiveDry = 0, currentDry = 0;
    let sumRh = 0, sumWs = 0, sumSol = 0;
    let zT2mSum = 0, zTmaxSum = 0, zPrecipSum = 0, zSolSum = 0;
    let extremeHeatDays = 0;

    chunk.forEach((r, idx) => {
      const b = baseline.get(r.doy) || { t2m: { mean: 15, std: 3 }, t2m_max: { mean: 20, std: 3 }, prectotcorr: { mean: 2, std: 3 }, allsky: { mean: 15, std: 4 } };
      sumT += r.t2m;
      if (r.t2m_max > maxT) maxT = r.t2m_max;
      if (r.t2m_min < minT) minT = r.t2m_min;

      if (r.t2m_max >= 35.0 || (r.t2m - b.t2m.mean) / b.t2m.std >= 2.0) {
        extremeHeatDays++;
      }

      sumPrecip += r.prectotcorr;
      if (r.prectotcorr < 0.1) {
        currentDry++;
        if (currentDry > consecutiveDry) consecutiveDry = currentDry;
      } else {
        currentDry = 0;
      }

      sumRh += r.rh2m;
      sumWs += r.ws10m;
      sumSol += r.allsky_sfc_sw_dwn;

      zT2mSum += (r.t2m - b.t2m.mean) / b.t2m.std;
      zTmaxSum += (r.t2m_max - b.t2m_max.mean) / b.t2m_max.std;
      zPrecipSum += (r.prectotcorr - b.prectotcorr.mean) / b.prectotcorr.std;
      zSolSum += (r.allsky_sfc_sw_dwn - b.allsky.mean) / b.allsky.std;
    });

    const meanT = sumT / windowDays;
    const meanRh = sumRh / windowDays;
    const meanWs = sumWs / windowDays;
    const meanSol = sumSol / windowDays;
    const zT2m = zT2mSum / windowDays;
    const zTmax = zTmaxSum / windowDays;
    const zPrecip = zPrecipSum / windowDays;
    const zSol = zSolSum / windowDays;

    // Linear trend / slope (T2M)
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let k = 0; k < windowDays; k++) {
      sumX += k;
      sumY += chunk[k].t2m;
      sumXY += k * chunk[k].t2m;
      sumXX += k * k;
    }
    const tSlope = Number(((windowDays * sumXY - sumX * sumY) / (windowDays * sumXX - sumX * sumX || 1)).toFixed(3));

    events.push({
      id: `ev_${startRow.date}_${endRow.date}`,
      startDate: startRow.date,
      endDate: endRow.date,
      year: yr,
      season,
      windowDays,
      metrics: {
        meanT: Number(meanT.toFixed(2)),
        maxT: Number(maxT.toFixed(2)),
        minT: Number(minT.toFixed(2)),
        totalPrecip: Number(sumPrecip.toFixed(2)),
        consecutiveDryDays: consecutiveDry,
        meanRh: Number(meanRh.toFixed(1)),
        meanWs: Number(meanWs.toFixed(2)),
        meanSol: Number(meanSol.toFixed(2)),
        tSlope,
        extremeHeatDays,
        zScores: {
          t2m: Number(zT2m.toFixed(2)),
          tmax: Number(zTmax.toFixed(2)),
          precip: Number(zPrecip.toFixed(2)),
          sol: Number(zSol.toFixed(2))
        }
      },
      series: chunk
    });
  }

  return events;
}

/**
 * Score events by user parsed criteria or reference event similarity
 */
export function scoreAndRankEvents(events, searchParams) {
  const cond = searchParams.conditions || {};
  const weights = cond.weights || { temp: 0.4, precip: 0.35, radiation: 0.15, cdd: 0.1 };
  const ref = searchParams.reference_event;

  let refEvent = null;
  if (ref && ref.year) {
    refEvent = events.find(e => e.year === ref.year && (!ref.month || parseInt(e.startDate.slice(4, 6), 10) === ref.month));
  }

  const scored = events.map((ev) => {
    let score = 0;

    if (refEvent) {
      // Reference event similarity
      const dT = Math.abs(ev.metrics.zScores.t2m - refEvent.metrics.zScores.t2m);
      const dP = Math.abs(ev.metrics.zScores.precip - refEvent.metrics.zScores.precip);
      const dS = Math.abs(ev.metrics.zScores.sol - refEvent.metrics.zScores.sol);
      const dCDD = Math.abs(ev.metrics.consecutiveDryDays - refEvent.metrics.consecutiveDryDays) / (ev.windowDays || 1);

      const simT = Math.max(0, 1 - dT / 3.0);
      const simP = Math.max(0, 1 - dP / 3.0);
      const simS = Math.max(0, 1 - dS / 3.0);
      const simCDD = Math.max(0, 1 - dCDD);

      const wT = weights.temp ?? 0.4;
      const wP = weights.precip ?? 0.35;
      const wS = weights.radiation ?? 0.15;
      const wCdd = weights.cdd ?? 0.1;
      const sumW = (wT + wP + wS + wCdd) || 1;

      score = (wT * simT + wP * simP + wS * simS + wCdd * simCDD) / sumW;
      score = Math.round(score * 100);
    } else {
      // Condition matching score
      let tScore = 50;
      if (cond.temperature === 'high') {
        tScore = ev.metrics.zScores.t2m >= 0
          ? Math.min(100, 50 + ev.metrics.zScores.t2m * 25)
          : Math.max(0, 30 + ev.metrics.zScores.t2m * 40);
      } else if (cond.temperature === 'low') {
        tScore = ev.metrics.zScores.t2m <= 0
          ? Math.min(100, 50 - ev.metrics.zScores.t2m * 25)
          : Math.max(0, 30 - ev.metrics.zScores.t2m * 40);
      }

      let pScore = 50;
      if (cond.precipitation === 'low') {
        pScore = Math.min(100, Math.max(0, 50 - ev.metrics.zScores.precip * 25 + (ev.metrics.consecutiveDryDays / ev.windowDays) * 20));
      } else if (cond.precipitation === 'high') {
        pScore = ev.metrics.zScores.precip >= 0
          ? Math.min(100, 50 + ev.metrics.zScores.precip * 30)
          : Math.max(0, 30 + ev.metrics.zScores.precip * 50);
      }

      let rScore = 50;
      if (cond.radiation === 'high') {
        rScore = Math.min(100, Math.max(0, 50 + ev.metrics.zScores.sol * 20));
      } else if (cond.radiation === 'low') {
        rScore = Math.min(100, Math.max(0, 50 - ev.metrics.zScores.sol * 20));
      }

      const cddScore = cond.precipitation === 'high'
        ? Math.max(0, 100 - (ev.metrics.consecutiveDryDays / ev.windowDays) * 100)
        : Math.min(100, (ev.metrics.consecutiveDryDays / ev.windowDays) * 100);

      const wT = weights.temp ?? 0.4;
      const wP = weights.precip ?? 0.35;
      const wS = weights.radiation ?? 0.15;
      const wCdd = weights.cdd ?? 0.1;
      const sumW = (wT + wP + wS + wCdd) || 1;

      score = (wT * tScore + wP * pScore + wS * rScore + wCdd * cddScore) / sumW;
      score = Math.round(Math.min(100, Math.max(0, score)));
    }

    return {
      ...ev,
      similarityScore: score,
      isExtreme: ev.metrics.zScores.t2m >= 2.0 || ev.metrics.extremeHeatDays >= 3 || ev.metrics.consecutiveDryDays >= 10
    };
  });

  // Sort by score descending
  scored.sort((a, b) => b.similarityScore - a.similarityScore);

  // Temporal Non-Maximum Suppression (NMS) to avoid adjacent redundant windows
  const selected = [];
  const minIntervalDays = Math.max(10, Math.floor(events[0]?.windowDays * 0.75 || 10));

  for (const item of scored) {
    const itemDate = new Date(Date.UTC(
      parseInt(item.startDate.slice(0, 4), 10),
      parseInt(item.startDate.slice(4, 6), 10) - 1,
      parseInt(item.startDate.slice(6, 8), 10)
    ));

    const tooClose = selected.some(sel => {
      const selDate = new Date(Date.UTC(
        parseInt(sel.startDate.slice(0, 4), 10),
        parseInt(sel.startDate.slice(4, 6), 10) - 1,
        parseInt(sel.startDate.slice(6, 8), 10)
      ));
      const diffDays = Math.abs((itemDate - selDate) / 86400000);
      return diffDays < minIntervalDays;
    });

    if (!tooClose) {
      selected.push(item);
      if (selected.length >= (searchParams.topK || 8)) break;
    }
  }

  return selected;
}
