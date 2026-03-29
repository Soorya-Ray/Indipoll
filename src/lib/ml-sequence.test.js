import { describe, expect, it } from "vitest";
import { historyRowsToSequence, observationToFeatureVector, stationToFeatureVector } from "./ml-sequence";

describe("ml-sequence", () => {
  it("parses numeric values from station payloads", () => {
    const vector = stationToFeatureVector({
      aqi: "181",
      pollutants: { PM2_5: "44", PM10: "21", NO2: "17", O3: "9" },
      weather: { Humidity: "63%", Wind: "11 km/h" },
      sources: { Vehicles: "35" },
    });

    expect(vector).toEqual({
      aqi: 181,
      pm25: 44,
      pm10: 21,
      no2: 17,
      o3: 9,
      humidity: 63,
      wind: 11,
      vehicles: 35,
    });
  });

  it("prefers persisted feature objects when observations include them", () => {
    const vector = observationToFeatureVector({
      aqi: 200,
      pollutants: { PM2_5: 50 },
      features: {
        aqi: 177,
        pm25: 41,
        pm10: 20,
        no2: 16,
        o3: 8,
        humidity: 58,
        wind: 7,
        vehicles: 29,
      },
    });

    expect(vector.aqi).toBe(177);
    expect(vector.pm25).toBe(41);
    expect(vector.vehicles).toBe(29);
  });

  it("pads shorter histories up to the configured lookback", () => {
    const sequence = historyRowsToSequence(
      [
        {
          observed_at: "2026-03-28T00:00:00.000Z",
          features: { aqi: 120, pm25: 30, pm10: 18, no2: 11, o3: 6, humidity: 55, wind: 9, vehicles: 24 },
        },
        {
          observed_at: "2026-03-28T01:00:00.000Z",
          features: { aqi: 132, pm25: 32, pm10: 19, no2: 12, o3: 7, humidity: 57, wind: 8, vehicles: 25 },
        },
      ],
      {
        id: "delhi",
        city: "Delhi",
        aqi: 140,
        pollutants: { PM2_5: 34, PM10: 20, NO2: 12, O3: 7 },
        weather: { Humidity: "58%", Wind: "8 km/h" },
        sources: { Vehicles: 26 },
      },
    );

    expect(sequence).toHaveLength(24);
    expect(sequence.at(-1)?.[0]).toBe(132);
  });
});
