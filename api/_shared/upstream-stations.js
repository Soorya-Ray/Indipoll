const WAQI_TOKEN = process.env.WAQI_TOKEN || "";

function formatIndiaTimestamp(date) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function normalizePollutants(iaqi, fallbackPollutants) {
  const next = { ...fallbackPollutants };
  const mapping = {
    pm25: "PM2_5",
    pm10: "PM10",
    no2: "NO2",
    o3: "O3",
    so2: "SO2",
    co: "CO",
  };

  Object.entries(mapping).forEach(([sourceKey, targetKey]) => {
    if (iaqi?.[sourceKey]?.v != null) {
      next[targetKey] = Math.max(1, Math.min(100, Math.round(iaqi[sourceKey].v)));
    }
  });

  return next;
}

function estimateSources(pollutants, fallbackSources) {
  const pm25 = pollutants.PM2_5 || 0;
  const no2 = pollutants.NO2 || 0;
  const so2 = pollutants.SO2 || 0;
  const pm10 = pollutants.PM10 || 0;
  const o3 = pollutants.O3 || 0;

  const draft = {
    Vehicles: Math.round(no2 * 1.4 + pm25 * 0.45),
    Industry: Math.round(so2 * 1.7 + pm25 * 0.5),
    Dust: Math.round(pm10 * 1.25),
    Residential: Math.round(pm25 * 0.38 + Math.max(0, Math.round((pollutants.CO || 0) / 3))),
    "Stubble burning": Math.round(pm25 * 0.34 + o3 * 0.22),
  };

  const total = Object.values(draft).reduce((sum, value) => sum + value, 0) || 1;
  const normalized = Object.fromEntries(
    Object.entries(draft).map(([key, value]) => [key, Math.round((value / total) * 100)]),
  );

  return { ...fallbackSources, ...normalized };
}

function buildFallbackWeather() {
  return {
    Temperature: "29 C",
    Humidity: "45%",
    Wind: "9 km/h",
    Rainfall: "0 mm",
    Pressure: "1006 hPa",
    Mixing: "Shallow",
  };
}

async function fetchWeather(station) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${station.lat}&longitude=${station.lon}` +
    "&current=temperature_2m,relative_humidity_2m,wind_speed_10m,surface_pressure,precipitation";

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Weather request failed for ${station.city}`);
  }

  const payload = await response.json();
  const current = payload.current;

  return {
    Temperature: `${Math.round(current.temperature_2m)} C`,
    Humidity: `${Math.round(current.relative_humidity_2m)}%`,
    Wind: `${Math.round(current.wind_speed_10m)} km/h`,
    Rainfall: `${Math.round(current.precipitation)} mm`,
    Pressure: `${Math.round(current.surface_pressure)} hPa`,
    Mixing: current.wind_speed_10m > 12 ? "Moderate" : "Shallow",
  };
}

async function fetchWaqi(station) {
  if (!WAQI_TOKEN) {
    return null;
  }

  const response = await fetch(`https://api.waqi.info/feed/geo:${station.lat};${station.lon}/?token=${WAQI_TOKEN}`);
  if (!response.ok) {
    throw new Error(`WAQI request failed for ${station.city}`);
  }

  const payload = await response.json();
  if (payload.status !== "ok") {
    throw new Error(`WAQI returned ${payload.status} for ${station.city}`);
  }

  return payload.data;
}

export async function enrichStationFromUpstream(seedStation) {
  const station = { ...seedStation };
  let dataMode = WAQI_TOKEN ? "live" : "demo";

  const [waqi, weather] = await Promise.allSettled([fetchWaqi(seedStation), fetchWeather(seedStation)]);

  if (waqi.status === "fulfilled" && waqi.value) {
    const liveAqi = Number(waqi.value.aqi);
    station.aqi = Number.isFinite(liveAqi) ? liveAqi : station.aqi;
    station.station = waqi.value.city?.name || station.station;
    station.updatedAt = formatIndiaTimestamp(new Date());
    station.pollutants = normalizePollutants(waqi.value.iaqi, station.pollutants);
    station.sources = estimateSources(station.pollutants, station.sources);
    dataMode = "waqi";
  }

  station.weather = weather.status === "fulfilled" ? weather.value : buildFallbackWeather();
  station.dataMode = dataMode;

  return station;
}
