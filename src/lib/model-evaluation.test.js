import { describe, expect, it } from "vitest";
import {
  MIN_REAL_EVALUATION_WINDOWS,
  buildEvaluationWindows,
  buildModelQualitySummary,
  buildTrainingWindow,
  decidePromotion,
  findStationEvaluation,
} from "./model-evaluation";

function makeObservationRow(stationSlug, stationCity, hourOffset, aqi) {
  return {
    station_slug: stationSlug,
    station_city: stationCity,
    observed_at: new Date(Date.UTC(2026, 2, 1, hourOffset)).toISOString(),
    aqi,
    features: {
      aqi,
      pm25: 30,
      pm10: 20,
      no2: 15,
      o3: 8,
      humidity: 50,
      wind: 8,
      vehicles: 25,
    },
  };
}

describe("model-evaluation", () => {
  it("creates rolling evaluation windows from real history", () => {
    const rows = Array.from({ length: 40 }, (_, index) => makeObservationRow("delhi", "Delhi", index, 100 + index));
    const windows = buildEvaluationWindows(rows);

    expect(windows.length).toBeGreaterThan(0);
    expect(windows[0].stationId).toBe("delhi");
    expect(windows[0].sequence).toHaveLength(24);
    expect(windows[0].target).toHaveLength(12);
  });

  it("keeps candidates in shadow when real evidence is too small", () => {
    const decision = decidePromotion(
      {
        samples: MIN_REAL_EVALUATION_WINDOWS - 1,
        rmse: 10,
        persistenceRmse: 12,
      },
      { version: "current-v1" },
    );

    expect(decision.shouldPromote).toBe(false);
    expect(decision.status).toBe("shadow");
    expect(decision.reason).toBe("insufficient-real-evaluation-windows");
  });

  it("promotes candidates that beat persistence with enough evidence", () => {
    const decision = decidePromotion(
      {
        samples: MIN_REAL_EVALUATION_WINDOWS + 4,
        rmse: 8,
        persistenceRmse: 10,
      },
      { version: "current-v1" },
    );

    expect(decision.shouldPromote).toBe(true);
    expect(decision.status).toBe("active");
    expect(decision.predecessorVersion).toBe("current-v1");
  });

  it("builds a limited-evidence summary when no evaluation is available", () => {
    const summary = buildModelQualitySummary({
      version: "test-model",
      evaluation: null,
    });

    expect(summary.state).toBe("limited-evidence");
  });

  it("finds station-specific evaluation details", () => {
    const stationEvaluation = findStationEvaluation(
      {
        cities: [{ stationId: "delhi", city: "Delhi", rmse: 9.1, samples: 12 }],
      },
      { id: "delhi", city: "Delhi" },
    );

    expect(stationEvaluation?.rmse).toBe(9.1);
  });

  it("captures the real training window", () => {
    const rows = [makeObservationRow("delhi", "Delhi", 0, 100), makeObservationRow("delhi", "Delhi", 39, 139)];
    const trainingWindow = buildTrainingWindow(rows);

    expect(trainingWindow.start).toBe(rows[0].observed_at);
    expect(trainingWindow.end).toBe(rows[1].observed_at);
  });
});
