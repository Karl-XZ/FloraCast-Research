// MOD13Q1 Collection 6.1 product metadata and pixel reliability table:
// https://modis.ornl.gov/rst/api/v1/MOD13Q1/bands
// https://lpdaac.usgs.gov/documents/621/MOD13_User_Guide_V61.pdf
export function parseMod13Point(subset, date) {
  const raw = (suffix) => {
    const band = subset.find((row) => String(row.band).toLowerCase().endsWith(suffix.toLowerCase()));
    const value = Array.isArray(band?.data) ? band.data[0] : band?.data;
    return value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
  };
  const reliability = raw('_pixel_reliability');
  const qaAccepted = reliability === 0;
  const scaled = (suffix) => {
    const value = raw(suffix);
    return qaAccepted && value !== null && value >= -2000 && value <= 10000 ? Number((value * 0.0001).toFixed(4)) : null;
  };
  return { date, ndvi: scaled('_NDVI'), evi: scaled('_EVI'), qaAccepted,
    qa: { reliability, policy: 'MOD13Q1 reliability=0 only', reason: reliability === null ? 'missing-quality' : qaAccepted ? 'good' : 'quality-excluded' },
    raw: { ndvi: raw('_NDVI'), evi: raw('_EVI'), compositeDayOfYear: raw('_composite_day_of_the_year') } };
}

export function parseMod13Area(subset, date, radiusKm, fallbackResolutionM = 1000) {
  const band = (suffix) => subset.find((row) => String(row.band).toLowerCase().endsWith(suffix.toLowerCase()));
  const ndviBand = band('_NDVI'), eviBand = band('_EVI'), qaBand = band('_pixel_reliability');
  const ndvi = Array.isArray(ndviBand?.data) ? ndviBand.data : [], evi = Array.isArray(eviBand?.data) ? eviBand.data : [];
  const qa = Array.isArray(qaBand?.data) ? qaBand.data : [];
  const length = Math.max(ndvi.length, evi.length, qa.length);
  const nrows = Number(ndviBand?.nrows || qaBand?.nrows || Math.round(Math.sqrt(length)) || 1);
  const ncols = Number(ndviBand?.ncols || qaBand?.ncols || Math.ceil(length / nrows) || 1);
  const cellsizeM = Math.abs(Number(ndviBand?.cellsize || qaBand?.cellsize || fallbackResolutionM));
  const centerRow = (nrows - 1) / 2, centerCol = (ncols - 1) / 2, radiusCells = radiusKm * 1000 / cellsizeM;
  const ndviAccepted = [], eviAccepted = [];
  let insidePixels = 0, goodQualityPixels = 0;
  for (let index = 0; index < length; index++) {
    const row = Math.floor(index / ncols), col = index % ncols;
    if ((row - centerRow) ** 2 + (col - centerCol) ** 2 > radiusCells ** 2 + 0.25) continue;
    insidePixels += 1;
    if (Number(qa[index]) !== 0) continue;
    goodQualityPixels += 1;
    const n = Number(ndvi[index]), e = Number(evi[index]);
    if (Number.isFinite(n) && n >= -2000 && n <= 10000) ndviAccepted.push(n * 0.0001);
    if (Number.isFinite(e) && e >= -2000 && e <= 10000) eviAccepted.push(e * 0.0001);
  }
  const average = (values) => values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4)) : null;
  return {
    date, ndvi: average(ndviAccepted), evi: average(eviAccepted), qaAccepted: ndviAccepted.length > 0,
    spatial: { statistic: 'circular-aoi-mean', radiusKm, cellsizeM, insidePixels, goodQualityPixels, validNdviPixels: ndviAccepted.length },
    qa: { policy: 'MOD13 reliability=0 only before area aggregation', coverage: insidePixels ? Number((goodQualityPixels / insidePixels).toFixed(4)) : 0,
      reason: ndviAccepted.length ? 'quality-screened-area-mean' : 'no-good-quality-pixels' }
  };
}
