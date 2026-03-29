import { describe, expect, it } from "vitest";
import generatedArtifact from "../data/ml-model-artifact.generated.js";
import { generateForecastPayload } from "./model-service";

describe("model-service", () => {
  it("returns a limited-evidence payload cleanly when evaluation is absent", () => {
    const artifact = {
      ...generatedArtifact,
      evaluationSummary: null,
      promotion: {
        status: "shadow",
        reason: "insufficient-real-evaluation-windows",
        predecessorVersion: null,
      },
      trainingWindow: {
        start: null,
        end: null,
      },
    };

    const payload = generateForecastPayload(
      {
        id: "delhi",
        city: "Delhi",
        station: "Anand Vihar",
        aqi: 220,
        pollutants: { PM2_5: 42, PM10: 24, NO2: 11, O3: 7, SO2: 6, CO: 10 },
        sources: { Vehicles: 34, Industry: 26, Dust: 12, Residential: 6, "Stubble burning": 22 },
        weather: { Temperature: "29 C", Humidity: "48%", Wind: "7 km/h", Rainfall: "0 mm", Pressure: "1006 hPa", Mixing: "Shallow" },
      },
      { artifact },
    );

    expect(payload.forecast.values).toHaveLength(12);
    expect(payload.shap.length).toBeGreaterThan(0);
    expect(payload.model.evaluation).toBeNull();
    expect(payload.model.promotion?.status).toBe("shadow");
  });
});
