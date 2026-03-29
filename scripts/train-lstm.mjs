import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import * as tf from "@tensorflow/tfjs";
import { seedStations } from "../src/data/cities.js";
import {
  FEATURE_NAMES,
  HORIZON_STEPS,
  LOOKBACK_STEPS,
  buildContextSequence,
  buildTrainingSet,
  buildTrainingSetFromObservationRows,
  historyRowsToSequence,
  mean,
} from "../src/lib/ml-sequence.js";
import { buildEvaluationWindows, buildTrainingWindow, decidePromotion, evaluateModel } from "../src/lib/model-evaluation.js";

const OUTPUT_PATH = path.resolve(process.cwd(), "src/data/ml-model-artifact.generated.js");

function transposeLastStep(sequences) {
  const featureCount = FEATURE_NAMES.length;
  return Array.from({ length: featureCount }, (_, featureIndex) =>
    sequences.map((sequence) => sequence[sequence.length - 1][featureIndex]),
  );
}

function computeFeatureStats(sequences) {
  const featureColumns = FEATURE_NAMES.map((_, featureIndex) =>
    sequences.flatMap((sequence) => sequence.map((step) => step[featureIndex])),
  );

  return {
    mean: featureColumns.map((column) => mean(column)),
    std: featureColumns.map((column) => {
      const avg = mean(column);
      const variance = mean(column.map((value) => (value - avg) ** 2));
      return Math.sqrt(variance) || 1;
    }),
  };
}

function computeTargetStats(targets) {
  const flattened = targets.flat();
  const avg = mean(flattened);
  const variance = mean(flattened.map((value) => (value - avg) ** 2));
  return {
    mean: avg,
    std: Math.sqrt(variance) || 1,
  };
}

function normalizeSequences(sequences, stats) {
  return sequences.map((sequence) =>
    sequence.map((step) => step.map((value, index) => (value - stats.mean[index]) / stats.std[index])),
  );
}

function normalizeTargets(targets, stats) {
  return targets.map((target) => target.map((value) => (value - stats.mean) / stats.std));
}

function averageLastStep(sequences, featureStats) {
  const columns = transposeLastStep(sequences);
  return columns.map((column, index) => (mean(column) - featureStats.mean[index]) / featureStats.std[index]);
}

async function loadLocalEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  let text = "";

  try {
    text = await fs.readFile(envPath, "utf8");
  } catch {
    return;
  }

  text.split(/\r?\n/).forEach((line) => {
    if (!line || line.trim().startsWith("#")) {
      return;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      return;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  });
}

async function fetchHistoricalObservations() {
  await loadLocalEnv();

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return [];
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const pageSize = 1000;
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("station_observations")
      .select("station_id, observed_at, aqi, pollutants, sources, weather, features, station:stations!inner(slug, city)")
      .order("observed_at", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw error;
    }

    if (!data?.length) {
      break;
    }

    rows.push(
      ...data.map((row) => ({
        ...row,
        station_slug: row.station?.slug,
        station_city: row.station?.city,
      })),
    );

    if (data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return rows;
}

function splitDataset(sequences, targets) {
  const splitIndex = Math.max(1, Math.floor(sequences.length * 0.86));

  return {
    trainSequences: sequences.slice(0, splitIndex),
    trainTargets: targets.slice(0, splitIndex),
    validationSequences: sequences.slice(splitIndex),
    validationTargets: targets.slice(splitIndex),
  };
}

async function saveModelRecord(artifact, metadata) {
  await loadLocalEnv();

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: activeArtifactRow, error: activeArtifactError } = await supabase
    .from("model_artifacts")
    .select("version, artifact, is_active")
    .eq("is_active", true)
    .order("trained_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (activeArtifactError) {
    throw activeArtifactError;
  }

  const promotionDecision = decidePromotion(artifact.evaluationSummary, activeArtifactRow?.artifact || null);
  artifact.promotion = {
    status: promotionDecision.status,
    reason: promotionDecision.reason,
    predecessorVersion: promotionDecision.predecessorVersion,
  };
  const dbEvaluationSummary = artifact.evaluationSummary || {};
  const dbEvaluationByHorizon = artifact.evaluationSummary?.horizon || [];
  const dbEvaluationByStation = artifact.evaluationSummary?.cities || [];

  if (promotionDecision.shouldPromote) {
    const { error: deactivateError } = await supabase.from("model_artifacts").update({ is_active: false }).eq("is_active", true);
    if (deactivateError) {
      throw deactivateError;
    }
  }

  const { error: insertError } = await supabase.from("model_artifacts").upsert(
    {
      version: artifact.version,
      trained_at: artifact.trainedAt,
      data_source: metadata.dataSource,
      sample_count: metadata.sampleCount,
      station_count: metadata.stationCount,
      lookback_steps: artifact.lookback,
      horizon_steps: artifact.horizon,
      metrics: metadata.metrics,
      evaluation_summary: dbEvaluationSummary,
      training_window_start: artifact.trainingWindow.start,
      training_window_end: artifact.trainingWindow.end,
      predecessor_version: artifact.promotion.predecessorVersion,
      promotion_status: artifact.promotion.status,
      promotion_reason: artifact.promotion.reason,
      artifact,
      is_active: promotionDecision.shouldPromote,
    },
    { onConflict: "version" },
  );

  if (insertError) {
    throw insertError;
  }

  const { error: evaluationInsertError } = await supabase.from("model_evaluations").insert({
    model_version: artifact.version,
    summary: dbEvaluationSummary,
    by_horizon: dbEvaluationByHorizon,
    by_station: dbEvaluationByStation,
  });

  if (evaluationInsertError) {
    throw evaluationInsertError;
  }

  console.log(
    JSON.stringify({
      event: "model_promotion_decision",
      version: artifact.version,
      promotion: artifact.promotion,
      evaluation: artifact.evaluationSummary,
    }),
  );
}

export async function runTrainingPipeline(options = {}) {
  const writeLocalArtifact = options.writeLocalArtifact ?? true;
  const historicalRows = await fetchHistoricalObservations();
  const historicalSet = buildTrainingSetFromObservationRows(historicalRows);
  const syntheticSet = buildTrainingSet(seedStations);
  const trimmedSyntheticSet = {
    sequences: syntheticSet.sequences.slice(0, 360),
    targets: syntheticSet.targets.slice(0, 360),
  };
  const useHistoryOnly = historicalSet.sequences.length >= 160 && historicalSet.stationCount >= 4;

  const sequences = useHistoryOnly
    ? historicalSet.sequences
    : historicalSet.sequences.concat(trimmedSyntheticSet.sequences);
  const targets = useHistoryOnly
    ? historicalSet.targets
    : historicalSet.targets.concat(trimmedSyntheticSet.targets);

  if (!sequences.length || !targets.length) {
    throw new Error("No training samples were generated.");
  }

  const {
    trainSequences,
    trainTargets,
    validationSequences,
    validationTargets,
  } = splitDataset(sequences, targets);

  const featureStats = computeFeatureStats(trainSequences);
  const targetStats = computeTargetStats(trainTargets);

  const normalizedTrainX = normalizeSequences(trainSequences, featureStats);
  const normalizedTrainY = normalizeTargets(trainTargets, targetStats);
  const normalizedValidationX = normalizeSequences(validationSequences, featureStats);
  const normalizedValidationY = normalizeTargets(validationTargets, targetStats);

  const trainX = tf.tensor3d(normalizedTrainX);
  const trainY = tf.tensor2d(normalizedTrainY);
  const validationX = tf.tensor3d(normalizedValidationX);
  const validationY = tf.tensor2d(normalizedValidationY);

  const model = tf.sequential();
  model.add(
    tf.layers.lstm({
      inputShape: [LOOKBACK_STEPS, FEATURE_NAMES.length],
      units: 20,
      activation: "tanh",
      recurrentActivation: "sigmoid",
    }),
  );
  model.add(tf.layers.dense({ units: HORIZON_STEPS }));

  model.compile({
    optimizer: tf.train.adam(0.006),
    loss: "meanSquaredError",
    metrics: ["mse"],
  });

  await model.fit(trainX, trainY, {
    epochs: 18,
    batchSize: 48,
    validationData: [validationX, validationY],
    verbose: 0,
  });

  const validationPredictions = model.predict(validationX);
  const validationArray = await validationPredictions.array();
  const actualArray = await validationY.array();

  const residuals = validationArray.flatMap((prediction, index) =>
    prediction.map((value, horizonIndex) => value - actualArray[index][horizonIndex]),
  );

  const residualStdNormalized = Math.sqrt(mean(residuals.map((value) => value ** 2))) || 1;
  const residualStd = residualStdNormalized * targetStats.std;
  const maeNormalized =
    residuals.reduce((sum, value) => sum + Math.abs(value), 0) / Math.max(1, residuals.length);

  const lstmLayer = model.layers[0];
  const denseLayer = model.layers[1];
  const [kernel, recurrentKernel, bias] = lstmLayer.getWeights();
  const [denseKernel, denseBias] = denseLayer.getWeights();

  const stationContext = Object.fromEntries(
    seedStations.map((station) => {
      const matchingRows = historicalRows.filter((row) => row.station_slug === station.id);
      return [station.id, matchingRows.length ? historyRowsToSequence(matchingRows, station) : buildContextSequence(station)];
    }),
  );

  const trainedAt = new Date().toISOString();
  const evaluationWindows = buildEvaluationWindows(historicalRows);
  const evaluationSummary = await evaluateModel(model, evaluationWindows, featureStats, targetStats, tf);
  const trainingWindow = buildTrainingWindow(historicalRows);
  const metrics = {
    validation_rmse: Number((residualStdNormalized * targetStats.std).toFixed(3)),
    validation_mae: Number((maeNormalized * targetStats.std).toFixed(3)),
    historical_observation_count: historicalRows.length,
    historical_sequence_count: historicalSet.sequences.length,
    synthetic_sequence_count: useHistoryOnly ? 0 : trimmedSyntheticSet.sequences.length,
    evaluation_window_count: evaluationWindows.length,
    evaluation_rmse: evaluationSummary?.rmse ?? null,
    persistence_rmse: evaluationSummary?.persistenceRmse ?? null,
    rolling_mean_rmse: evaluationSummary?.rollingMeanRmse ?? null,
  };

  const artifact = {
    version: `indipoll-lstm-v2-${trainedAt.slice(0, 10)}`,
    trainedAt,
    lookback: LOOKBACK_STEPS,
    horizon: HORIZON_STEPS,
    featureNames: FEATURE_NAMES,
    featureStats,
    targetStats,
    baselineLastStep: averageLastStep(trainSequences, featureStats),
    residualStd,
    dataSource: useHistoryOnly ? "supabase-history" : "supabase-history-plus-seed-augmentation",
    sampleCount: sequences.length,
    stationCount: Math.max(historicalSet.stationCount, seedStations.length),
    metrics,
    evaluationSummary,
    promotion: {
      status: "shadow",
      reason: "awaiting-registry-decision",
      predecessorVersion: null,
    },
    trainingWindow,
    seedContext: stationContext,
    weights: {
      kernel: await kernel.array(),
      recurrentKernel: await recurrentKernel.array(),
      bias: await bias.array(),
      denseKernel: await denseKernel.array(),
      denseBias: await denseBias.array(),
    },
  };

  if (writeLocalArtifact) {
    const fileContents = `const artifact = ${JSON.stringify(artifact, null, 2)};\n\nexport default artifact;\n`;
    await fs.writeFile(OUTPUT_PATH, fileContents, "utf8");
  }

  await saveModelRecord(artifact, {
    dataSource: artifact.dataSource,
    sampleCount: artifact.sampleCount,
    stationCount: artifact.stationCount,
    metrics,
  });

  tf.dispose([trainX, trainY, validationX, validationY, validationPredictions]);
  await tf.nextFrame();

  if (writeLocalArtifact) {
    console.log(`Wrote model artifact to ${OUTPUT_PATH}`);
  }
  console.log(`Training data source: ${artifact.dataSource}`);
  console.log(`Historical observations used: ${historicalRows.length}`);
  console.log(
    JSON.stringify({
      event: "model_training_complete",
      version: artifact.version,
      evaluation: artifact.evaluationSummary,
      promotion: artifact.promotion,
      trainingWindow: artifact.trainingWindow,
    }),
  );

  return {
    artifact,
  };
}

async function main() {
  await runTrainingPipeline();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
