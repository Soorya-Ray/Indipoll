const LOOKBACK_STEPS = 24;
const HORIZON_STEPS = 12;
const FEATURE_NAMES = ["aqi", "pm25", "pm10", "no2", "o3", "humidity", "wind", "vehicles"];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hashStation(stationId) {
  return [...stationId].reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 1), 0);
}

function parseNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const cleaned = String(value ?? "").replace(/[^0-9.-]/g, "");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export { FEATURE_NAMES, HORIZON_STEPS, LOOKBACK_STEPS, mean };

export function featureObjectToArray(featureObject) {
  return FEATURE_NAMES.map((name) => featureObject[name]);
}

export function stationToFeatureVector(station) {
  return {
    aqi: parseNumber(station.aqi, 120),
    pm25: parseNumber(station.pollutants?.PM2_5, 40),
    pm10: parseNumber(station.pollutants?.PM10, 30),
    no2: parseNumber(station.pollutants?.NO2, 15),
    o3: parseNumber(station.pollutants?.O3, 12),
    humidity: parseNumber(station.weather?.Humidity, 50),
    wind: parseNumber(station.weather?.Wind, 8),
    vehicles: parseNumber(station.sources?.Vehicles, 25),
  };
}

export function observationToFeatureVector(observation) {
  if (observation?.features) {
    return {
      aqi: parseNumber(observation.features.aqi, parseNumber(observation.aqi, 120)),
      pm25: parseNumber(observation.features.pm25, parseNumber(observation.pollutants?.PM2_5, 40)),
      pm10: parseNumber(observation.features.pm10, parseNumber(observation.pollutants?.PM10, 30)),
      no2: parseNumber(observation.features.no2, parseNumber(observation.pollutants?.NO2, 15)),
      o3: parseNumber(observation.features.o3, parseNumber(observation.pollutants?.O3, 12)),
      humidity: parseNumber(observation.features.humidity, parseNumber(observation.weather?.Humidity, 50)),
      wind: parseNumber(observation.features.wind, parseNumber(observation.weather?.Wind, 8)),
      vehicles: parseNumber(observation.features.vehicles, parseNumber(observation.sources?.Vehicles, 25)),
    };
  }

  return stationToFeatureVector(observation);
}

function buildFeatureSeries(station, totalSteps = 420) {
  const base = stationToFeatureVector(station);
  const stationHash = hashStation(station.id || station.city || "station");
  const volatility = 0.7 + (stationHash % 5) * 0.08;
  let state = {
    aqi: base.aqi * (0.82 + (stationHash % 9) * 0.015),
    pm25: base.pm25,
    pm10: base.pm10,
    no2: base.no2,
    o3: base.o3,
    humidity: base.humidity,
    wind: base.wind,
    vehicles: base.vehicles,
  };

  return Array.from({ length: totalSteps }, (_, stepIndex) => {
    const hour = stepIndex % 24;
    const seasonal = Math.sin(((stepIndex + stationHash) / 96) * Math.PI * 2);
    const diurnal = Math.sin(((hour + stationHash % 4) / 24) * Math.PI * 2);
    const traffic = Math.cos(((hour + 2) / 24) * Math.PI * 2);
    const burnPulse = stepIndex % 57 === 0 ? 18 : 0;
    const dustPulse = stepIndex % 41 === 0 ? 14 : 0;

    state = {
      humidity: clamp(base.humidity + diurnal * 12 + seasonal * 6, 18, 96),
      wind: clamp(base.wind + Math.cos((hour / 24) * Math.PI * 2) * 3 + seasonal * 1.2, 1, 26),
      vehicles: clamp(base.vehicles + traffic * 7 + seasonal * 2, 5, 75),
      pm25: clamp(state.pm25 * 0.68 + base.pm25 * 0.23 + diurnal * 4 + burnPulse * 0.5, 5, 170),
      pm10: clamp(state.pm10 * 0.64 + base.pm10 * 0.26 + dustPulse * 0.55 + traffic * 3, 8, 210),
      no2: clamp(state.no2 * 0.61 + base.no2 * 0.31 + traffic * 5 + volatility * 1.8, 1, 110),
      o3: clamp(state.o3 * 0.58 + base.o3 * 0.28 - diurnal * 4 + seasonal * 3, 1, 130),
      aqi: 0,
    };

    const pollutionPressure =
      state.pm25 * 1.18 +
      state.pm10 * 0.34 +
      state.no2 * 0.72 +
      state.o3 * 0.31 +
      state.vehicles * 0.44 +
      state.humidity * 0.14 -
      state.wind * 1.6;

    state.aqi = clamp(state.aqi * 0.52 + pollutionPressure * 0.43 + seasonal * 11 + volatility * 8, 28, 520);

    return { ...state };
  });
}

export function buildContextSequence(station, anchorHour = 18) {
  const base = stationToFeatureVector(station);
  const stationHash = hashStation(station.id || station.city || "station");

  return Array.from({ length: LOOKBACK_STEPS }, (_, index) => {
    const stepFromNow = LOOKBACK_STEPS - index;
    const hour = (anchorHour - stepFromNow + 24 * 30) % 24;
    const diurnal = Math.sin(((hour + stationHash % 7) / 24) * Math.PI * 2);
    const traffic = Math.cos(((hour + 3) / 24) * Math.PI * 2);
    const persistence = 1 - stepFromNow / (LOOKBACK_STEPS * 1.35);
    const pressure = (stationHash % 11) / 10;

    return featureObjectToArray({
      aqi: clamp(base.aqi * (0.78 + persistence * 0.26) + diurnal * 18 + pressure * 6, 25, 520),
      pm25: clamp(base.pm25 * (0.82 + persistence * 0.24) + diurnal * 6, 4, 160),
      pm10: clamp(base.pm10 * (0.8 + persistence * 0.2) + traffic * 8, 6, 180),
      no2: clamp(base.no2 * (0.74 + persistence * 0.22) + traffic * 4, 1, 120),
      o3: clamp(base.o3 * (0.8 + persistence * 0.16) - diurnal * 5, 1, 140),
      humidity: clamp(base.humidity + Math.cos((hour / 24) * Math.PI * 2) * 8, 15, 98),
      wind: clamp(base.wind + Math.sin((hour / 24) * Math.PI * 2) * 2.4, 1, 28),
      vehicles: clamp(base.vehicles + traffic * 4, 5, 70),
    });
  });
}

export function simulateStationSeries(station, totalSteps = 420) {
  return buildFeatureSeries(station, totalSteps).map(featureObjectToArray);
}

function buildWindowsFromSeries(series, stride = 1) {
  const sequences = [];
  const targets = [];

  for (let index = LOOKBACK_STEPS; index <= series.length - HORIZON_STEPS; index += stride) {
    sequences.push(series.slice(index - LOOKBACK_STEPS, index));
    targets.push(series.slice(index, index + HORIZON_STEPS).map((step) => step[0]));
  }

  return { sequences, targets };
}

export function historyRowsToSequence(rows, station) {
  const sortedRows = [...rows].sort((left, right) => new Date(left.observed_at) - new Date(right.observed_at));
  const actualSequence = sortedRows.map((row) => featureObjectToArray(observationToFeatureVector(row)));

  if (actualSequence.length >= LOOKBACK_STEPS) {
    return actualSequence.slice(-LOOKBACK_STEPS);
  }

  const fallbackSequence = buildContextSequence(station);
  return fallbackSequence.slice(0, LOOKBACK_STEPS - actualSequence.length).concat(actualSequence);
}

export function buildTrainingSet(stations) {
  const sequences = [];
  const targets = [];

  stations.forEach((station) => {
    const series = simulateStationSeries(station, 520);
    const windows = buildWindowsFromSeries(series, 2);
    sequences.push(...windows.sequences);
    targets.push(...windows.targets);
  });

  return { sequences, targets };
}

export function buildTrainingSetFromObservationRows(rows) {
  const grouped = new Map();

  rows.forEach((row) => {
    const stationKey = row.station_slug || row.station_id || row.stationId;
    if (!stationKey) {
      return;
    }

    if (!grouped.has(stationKey)) {
      grouped.set(stationKey, []);
    }

    grouped.get(stationKey).push(row);
  });

  const sequences = [];
  const targets = [];
  let usableStations = 0;

  grouped.forEach((stationRows) => {
    const sortedSeries = stationRows
      .sort((left, right) => new Date(left.observed_at) - new Date(right.observed_at))
      .map((row) => featureObjectToArray(observationToFeatureVector(row)));

    if (sortedSeries.length < LOOKBACK_STEPS + HORIZON_STEPS) {
      return;
    }

    usableStations += 1;
    const windows = buildWindowsFromSeries(sortedSeries, 1);
    sequences.push(...windows.sequences);
    targets.push(...windows.targets);
  });

  return {
    sequences,
    targets,
    stationCount: usableStations,
  };
}
