import modelArtifact from "../data/ml-model-artifact.generated.js";
import { FEATURE_NAMES, buildContextSequence, historyRowsToSequence, stationToFeatureVector } from "./ml-sequence.js";

function sigmoid(value) {
  return 1 / (1 + Math.exp(-value));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeFeatureStep(step) {
  return step.map((value, index) => (value - modelArtifact.featureStats.mean[index]) / modelArtifact.featureStats.std[index]);
}

function denormalizeTarget(value) {
  return value * modelArtifact.targetStats.std + modelArtifact.targetStats.mean;
}

function matVecMul(matrix, vector) {
  return matrix[0].map((_, columnIndex) =>
    matrix.reduce((sum, row, rowIndex) => sum + row[columnIndex] * vector[rowIndex], 0),
  );
}

function addVectors(left, right) {
  return left.map((value, index) => value + right[index]);
}

function runLstm(sequence) {
  const units = modelArtifact.weights.recurrentKernel.length;
  let hidden = Array(units).fill(0);
  let cell = Array(units).fill(0);

  sequence.forEach((step) => {
    const inputPart = matVecMul(modelArtifact.weights.kernel, step);
    const recurrentPart = matVecMul(modelArtifact.weights.recurrentKernel, hidden);
    const gates = addVectors(addVectors(inputPart, recurrentPart), modelArtifact.weights.bias);

    const inputGate = gates.slice(0, units).map(sigmoid);
    const forgetGate = gates.slice(units, units * 2).map(sigmoid);
    const cellCandidate = gates.slice(units * 2, units * 3).map((value) => Math.tanh(value));
    const outputGate = gates.slice(units * 3).map(sigmoid);

    cell = cell.map((value, index) => forgetGate[index] * value + inputGate[index] * cellCandidate[index]);
    hidden = hidden.map((_, index) => outputGate[index] * Math.tanh(cell[index]));
  });

  const denseOutput = addVectors(matVecMul(modelArtifact.weights.denseKernel, hidden), modelArtifact.weights.denseBias);
  return denseOutput.map(denormalizeTarget);
}

function buildConfidenceBand(values) {
  const spread = modelArtifact.residualStd || 18;
  return {
    upper: values.map((value, index) => Math.round(value + spread * (1 + index * 0.06))),
    lower: values.map((value, index) => Math.max(20, Math.round(value - spread * (1 + index * 0.06)))),
  };
}

function buildModelSequence(station, options = {}) {
  const fallbackContext = buildContextSequence(station);
  const historicalContext = options.historyRows?.length ? historyRowsToSequence(options.historyRows, station) : null;
  const seedContext = historicalContext || modelArtifact.seedContext?.[station.id] || fallbackContext;
  const featureVector = stationToFeatureVector(station);
  const nextContext = seedContext.slice(-modelArtifact.lookback).map((step, index, array) => {
    if (index !== array.length - 1) {
      return step;
    }

    return FEATURE_NAMES.map((featureName) => featureVector[featureName]);
  });

  return nextContext.map(normalizeFeatureStep);
}

function forecastMeanForFeatures(sequence, maskedLastStep) {
  const maskedSequence = sequence.map((step, index, array) =>
    index === array.length - 1 ? maskedLastStep : step,
  );
  return runLstm(maskedSequence).reduce((sum, value) => sum + value, 0) / modelArtifact.horizon;
}

function factorial(value) {
  return value <= 1 ? 1 : value * factorial(value - 1);
}

function explainForecast(sequence, station) {
  const actual = sequence[sequence.length - 1];
  const baseline = modelArtifact.baselineLastStep;
  const featureCount = FEATURE_NAMES.length;
  const shapValues = Array(featureCount).fill(0);
  const subsetWeights = Array.from({ length: featureCount + 1 }, (_, size) =>
    (factorial(size) * factorial(featureCount - size - 1 >= 0 ? featureCount - size - 1 : 0)) / factorial(featureCount),
  );

  const coalitionValue = new Map();

  for (let mask = 0; mask < 2 ** featureCount; mask += 1) {
    const maskedLastStep = actual.map((value, index) => ((mask >> index) & 1 ? value : baseline[index]));
    coalitionValue.set(mask, forecastMeanForFeatures(sequence, maskedLastStep));
  }

  for (let featureIndex = 0; featureIndex < featureCount; featureIndex += 1) {
    for (let mask = 0; mask < 2 ** featureCount; mask += 1) {
      if ((mask >> featureIndex) & 1) {
        continue;
      }

      const coalitionSize = mask.toString(2).split("1").length - 1;
      const withFeature = mask | (1 << featureIndex);
      shapValues[featureIndex] += subsetWeights[coalitionSize] * (coalitionValue.get(withFeature) - coalitionValue.get(mask));
    }
  }

  const displayNames = {
    aqi: "Recent AQI memory",
    pm25: "PM2.5 load",
    pm10: "PM10 load",
    no2: "NO2 traffic burden",
    o3: "Ozone chemistry",
    humidity: "Humidity regime",
    wind: "Wind dispersion",
    vehicles: "Vehicle emissions share",
  };
  const stationLabel = station.city || station.cityName || station.name || station.station || "this station";

  return shapValues
    .map((value, index) => ({
      feature: displayNames[FEATURE_NAMES[index]],
      rawFeature: FEATURE_NAMES[index],
      impact: value >= 0 ? "up" : "down",
      magnitude: Math.abs(value),
      text:
        value >= 0
          ? `${displayNames[FEATURE_NAMES[index]]} is pushing the 72-hour mean forecast up by about ${Math.abs(value).toFixed(1)} AQI points in ${stationLabel}.`
          : `${displayNames[FEATURE_NAMES[index]]} is helping pull the 72-hour mean forecast down by about ${Math.abs(value).toFixed(1)} AQI points in ${stationLabel}.`,
    }))
    .sort((left, right) => right.magnitude - left.magnitude)
    .slice(0, 4);
}

export function generateForecastPayload(station, options = {}) {
  const sequence = buildModelSequence(station, options);
  const rawForecast = runLstm(sequence).map((value) => Math.round(clamp(value, 20, 520)));
  const confidenceBand = buildConfidenceBand(rawForecast);
  const shap = explainForecast(sequence, station);
  const evaluationSummary = modelArtifact.evaluationSummary || null;

  return {
    forecast: {
      values: rawForecast,
      upper: confidenceBand.upper,
      lower: confidenceBand.lower,
    },
    shap,
    model: {
      version: modelArtifact.version,
      trainedAt: modelArtifact.trainedAt,
      generatedAt: new Date().toISOString(),
      confidence: "shap-exact-last-step",
      dataSource: modelArtifact.dataSource,
      sampleCount: modelArtifact.sampleCount,
      metrics: modelArtifact.metrics,
      evaluation: evaluationSummary
        ? {
            samples: evaluationSummary.samples,
            rmse: evaluationSummary.rmse,
            mae: evaluationSummary.mae,
            persistenceRmse: evaluationSummary.persistenceRmse,
            persistenceMae: evaluationSummary.persistenceMae,
            persistenceDelta: evaluationSummary.persistenceDelta,
            horizon: evaluationSummary.horizon,
          }
        : null,
      historySamples: options.historyRows?.length || 0,
    },
    mode: "live",
  };
}
