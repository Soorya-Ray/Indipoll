import { FEATURE_NAMES, HORIZON_STEPS, LOOKBACK_STEPS, featureObjectToArray, mean, observationToFeatureVector } from "./ml-sequence.js";

export const MIN_REAL_EVALUATION_WINDOWS = 8;

export function normalizeSequence(sequence, stats) {
  return sequence.map((step) => step.map((value, index) => (value - stats.mean[index]) / stats.std[index]));
}

export function denormalizeOutputs(outputs, stats) {
  return outputs.map((value) => value * stats.std + stats.mean);
}

export function buildEvaluationWindows(rows) {
  const grouped = new Map();

  rows.forEach((row) => {
    if (!row.station_slug) {
      return;
    }

    if (!grouped.has(row.station_slug)) {
      grouped.set(row.station_slug, []);
    }

    grouped.get(row.station_slug).push(row);
  });

  const windows = [];

  grouped.forEach((stationRows, stationSlug) => {
    const sortedRows = [...stationRows].sort((left, right) => new Date(left.observed_at) - new Date(right.observed_at));
    if (sortedRows.length < LOOKBACK_STEPS + HORIZON_STEPS) {
      return;
    }

    for (let index = LOOKBACK_STEPS; index <= sortedRows.length - HORIZON_STEPS; index += 1) {
      const contextRows = sortedRows.slice(index - LOOKBACK_STEPS, index);
      const targetRows = sortedRows.slice(index, index + HORIZON_STEPS);

      windows.push({
        stationId: stationSlug,
        stationCity: sortedRows[index - 1]?.station_city || stationSlug,
        sequence: contextRows.map((row) => featureObjectToArray(observationToFeatureVector(row))),
        target: targetRows.map((row) => row.aqi),
      });
    }
  });

  return windows;
}

export function roundMetric(value, digits = 3) {
  return Number(value.toFixed(digits));
}

function summarizeErrors(values) {
  if (!values.length) {
    return { rmse: 0, mae: 0 };
  }

  const squaredMean = mean(values.map((value) => value ** 2));
  return {
    rmse: roundMetric(Math.sqrt(squaredMean) || 0),
    mae: roundMetric(mean(values.map((value) => Math.abs(value)))),
  };
}

function persistenceBaseline(window) {
  return Array(HORIZON_STEPS).fill(window.sequence[window.sequence.length - 1][0]);
}

function rollingMeanBaseline(window) {
  const average = mean(window.sequence.map((step) => step[0]));
  return Array(HORIZON_STEPS).fill(average);
}

export async function evaluateModel(model, windows, featureStats, targetStats, tf) {
  if (!windows.length) {
    return null;
  }

  const evaluationTensor = tf.tensor3d(windows.map((window) => normalizeSequence(window.sequence, featureStats)));
  const predictionTensor = model.predict(evaluationTensor);
  const predictionRows = await predictionTensor.array();

  tf.dispose([evaluationTensor, predictionTensor]);

  const overallResiduals = [];
  const persistenceResiduals = [];
  const rollingResiduals = [];
  const horizonBuckets = Array.from({ length: HORIZON_STEPS }, () => []);
  const persistenceHorizonBuckets = Array.from({ length: HORIZON_STEPS }, () => []);
  const rollingHorizonBuckets = Array.from({ length: HORIZON_STEPS }, () => []);
  const cityBuckets = new Map();

  windows.forEach((window, index) => {
    const prediction = denormalizeOutputs(predictionRows[index], targetStats);
    const persistence = persistenceBaseline(window);
    const rollingMean = rollingMeanBaseline(window);

    window.target.forEach((actual, horizonIndex) => {
      const residual = prediction[horizonIndex] - actual;
      const persistenceResidual = persistence[horizonIndex] - actual;
      const rollingResidual = rollingMean[horizonIndex] - actual;

      overallResiduals.push(residual);
      persistenceResiduals.push(persistenceResidual);
      rollingResiduals.push(rollingResidual);
      horizonBuckets[horizonIndex].push(residual);
      persistenceHorizonBuckets[horizonIndex].push(persistenceResidual);
      rollingHorizonBuckets[horizonIndex].push(rollingResidual);
    });

    if (!cityBuckets.has(window.stationId)) {
      cityBuckets.set(window.stationId, {
        city: window.stationCity,
        residuals: [],
        persistenceResiduals: [],
        rollingResiduals: [],
        samples: 0,
      });
    }

    const bucket = cityBuckets.get(window.stationId);
    bucket.samples += 1;
    bucket.residuals.push(...window.target.map((actual, horizonIndex) => prediction[horizonIndex] - actual));
    bucket.persistenceResiduals.push(
      ...window.target.map((actual, horizonIndex) => persistence[horizonIndex] - actual),
    );
    bucket.rollingResiduals.push(
      ...window.target.map((actual, horizonIndex) => rollingMean[horizonIndex] - actual),
    );
  });

  const overall = summarizeErrors(overallResiduals);
  const persistence = summarizeErrors(persistenceResiduals);
  const rollingMean = summarizeErrors(rollingResiduals);
  const persistenceDelta =
    persistence.rmse > 0 ? roundMetric(((persistence.rmse - overall.rmse) / persistence.rmse) * 100, 1) : 0;
  const rollingMeanDelta =
    rollingMean.rmse > 0 ? roundMetric(((rollingMean.rmse - overall.rmse) / rollingMean.rmse) * 100, 1) : 0;

  return {
    samples: windows.length,
    rmse: overall.rmse,
    mae: overall.mae,
    persistenceRmse: persistence.rmse,
    persistenceMae: persistence.mae,
    persistenceDelta,
    rollingMeanRmse: rollingMean.rmse,
    rollingMeanMae: rollingMean.mae,
    rollingMeanDelta,
    horizon: horizonBuckets.map((bucket, index) => {
      const horizonSummary = summarizeErrors(bucket);
      const persistenceSummary = summarizeErrors(persistenceHorizonBuckets[index]);
      const rollingSummary = summarizeErrors(rollingHorizonBuckets[index]);
      return {
        step: index + 1,
        label: `${(index + 1) * 6}h`,
        rmse: horizonSummary.rmse,
        mae: horizonSummary.mae,
        persistenceRmse: persistenceSummary.rmse,
        persistenceMae: persistenceSummary.mae,
        rollingMeanRmse: rollingSummary.rmse,
        rollingMeanMae: rollingSummary.mae,
      };
    }),
    cities: [...cityBuckets.entries()]
      .map(([stationId, bucket]) => {
        const citySummary = summarizeErrors(bucket.residuals);
        const persistenceSummary = summarizeErrors(bucket.persistenceResiduals);
        const rollingSummary = summarizeErrors(bucket.rollingResiduals);
        return {
          stationId,
          city: bucket.city,
          samples: bucket.samples,
          rmse: citySummary.rmse,
          mae: citySummary.mae,
          persistenceRmse: persistenceSummary.rmse,
          persistenceMae: persistenceSummary.mae,
          persistenceDelta:
            persistenceSummary.rmse > 0
              ? roundMetric(((persistenceSummary.rmse - citySummary.rmse) / persistenceSummary.rmse) * 100, 1)
              : 0,
          rollingMeanRmse: rollingSummary.rmse,
          rollingMeanMae: rollingSummary.mae,
          rollingMeanDelta:
            rollingSummary.rmse > 0
              ? roundMetric(((rollingSummary.rmse - citySummary.rmse) / rollingSummary.rmse) * 100, 1)
              : 0,
        };
      })
      .sort((left, right) => left.city.localeCompare(right.city)),
  };
}

export function buildTrainingWindow(rows) {
  if (!rows.length) {
    return {
      start: null,
      end: null,
    };
  }

  const sortedRows = [...rows].sort((left, right) => new Date(left.observed_at) - new Date(right.observed_at));
  return {
    start: sortedRows[0]?.observed_at || null,
    end: sortedRows[sortedRows.length - 1]?.observed_at || null,
  };
}

export function decidePromotion(evaluationSummary, previousArtifact) {
  if (!evaluationSummary || evaluationSummary.samples < MIN_REAL_EVALUATION_WINDOWS) {
    return {
      shouldPromote: false,
      status: "shadow",
      reason: "insufficient-real-evaluation-windows",
      predecessorVersion: previousArtifact?.version || null,
    };
  }

  if (evaluationSummary.rmse >= evaluationSummary.persistenceRmse) {
    return {
      shouldPromote: false,
      status: "shadow",
      reason: "worse-than-persistence-baseline",
      predecessorVersion: previousArtifact?.version || null,
    };
  }

  return {
    shouldPromote: true,
    status: "active",
    reason: previousArtifact?.version ? "beats-baseline-and-replaces-active-model" : "beats-baseline-and-becomes-first-active-model",
    predecessorVersion: previousArtifact?.version || null,
  };
}

export function findStationEvaluation(evaluationSummary, station) {
  if (!evaluationSummary?.cities?.length || !station) {
    return null;
  }

  return (
    evaluationSummary.cities.find((entry) => entry.stationId === station.id) ||
    evaluationSummary.cities.find((entry) => entry.city === station.city) ||
    null
  );
}

export function buildModelQualitySummary(model) {
  if (!model?.evaluation) {
    return {
      state: "limited-evidence",
      headline: "Limited evidence",
      note: "This forecast is running, but it does not yet have enough real historical backtesting to claim strong model quality.",
    };
  }

  const beatsPersistence = model.evaluation.persistenceDelta > 0;
  return {
    state: beatsPersistence ? "validated" : "caution",
    headline: beatsPersistence ? "Backtested against persistence" : "Backtest is still weak",
    note: beatsPersistence
      ? `The active model is ${model.evaluation.persistenceDelta}% better than a persistence baseline on real windows.`
      : "The active model does not yet beat the persistence baseline consistently, so treat the forecast as directional.",
  };
}

export function getArtifactFeatureNames() {
  return FEATURE_NAMES;
}
