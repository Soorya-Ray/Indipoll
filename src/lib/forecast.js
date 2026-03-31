export function buildForecastSeries(baseAqi, cityName) {
  const phaseShift = cityName.length % 5;
  const values = Array.from({ length: 12 }, (_, index) => {
    const wave = Math.sin((index + phaseShift) / 2.2) * 18;
    const trend = index < 4 ? index * 4 : -index * 2;
    return Math.max(42, Math.round(baseAqi + wave + trend));
  });

  const upper = values.map((value, index) => value + 14 + (index % 3) * 3);
  const lower = values.map((value, index) => Math.max(20, value - 15 - (index % 2) * 4));

  return { values, upper, lower };
}

export function buildShapNarratives(station) {
  const topPollutants = Object.entries(station.pollutants)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([name]) => name.replace("_", "."));

  const topSources = Object.entries(station.sources)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([name]) => name);

  const humidity = Number.parseInt(station.weather?.Humidity || "0", 10);
  const wind = Number.parseInt(station.weather?.Wind || "0", 10);

  return [
    {
      feature: `${topPollutants[0]} load`,
      rawFeature: "pollutant_load",
      impact: "up",
      magnitude: 8.4,
      text: `${topPollutants[0]} is the strongest modeled driver right now, and it is keeping the next-day AQI baseline elevated in ${station.city}.`,
    },
    {
      feature: `${topSources[0]} emissions`,
      rawFeature: "source_emissions",
      impact: "up",
      magnitude: 6.8,
      text: `${topSources[0]} appears to be the dominant source category, with ${topSources[1]} adding secondary pressure to the forecast.`,
    },
    {
      feature: "Humidity regime",
      rawFeature: "humidity",
      impact: humidity > 60 ? "up" : "down",
      magnitude: humidity > 60 ? 4.2 : 3.6,
      text:
        humidity > 60
          ? "Higher humidity supports secondary particle formation overnight, which pushes the confidence band upward."
          : "Lower humidity slightly reduces secondary aerosol formation, which helps cap the upper confidence band.",
    },
    {
      feature: "Wind-driven dispersion",
      rawFeature: "wind",
      impact: wind >= 12 ? "down" : "up",
      magnitude: wind >= 12 ? 5.1 : 4.4,
      text:
        wind >= 12
          ? "Stronger winds should improve dispersion through the next cycle and soften the AQI peak."
          : "Light winds mean pollutants linger longer near the surface, which supports a slower decline in AQI.",
    },
  ];
}
