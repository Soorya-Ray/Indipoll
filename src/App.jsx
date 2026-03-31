import { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar";
import { healthProfiles } from "./data/profiles";
import { useCommunityReports } from "./hooks/useCommunityReports";
import { useStations } from "./hooks/useStations";
import CommunityPage from "./pages/CommunityPage";
import ForecastPage from "./pages/ForecastPage";
import HealthPage from "./pages/HealthPage";
import HomePage from "./pages/HomePage";
import StationsPage from "./pages/StationsPage";

function useTheme() {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem("indipoll-theme") || "dark"; } catch { return "dark"; }
  });

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem("indipoll-theme", theme);
    } catch {
      console.warn("[indipoll] Unable to persist theme preference");
    }
  }, [theme]);

  const toggle = () => setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  return { theme, toggle };
}

function parseStationUpdatedAt(station) {
  if (station.rawUpdatedAt) {
    const timestamp = new Date(station.rawUpdatedAt).getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
  }

  if (!station.updatedAt) {
    return null;
  }

  const normalized = station.updatedAt.replace(" IST", " GMT+0530");
  const timestamp = new Date(normalized).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function nearestStation(latitude, longitude, stations) {
  return stations
    .map((station) => ({
      station,
      distance: Math.hypot(latitude - station.lat, longitude - station.lon),
    }))
    .sort((a, b) => a.distance - b.distance)[0]?.station;
}

export default function App() {
  const [currentProfile, setCurrentProfile] = useState("asthmatic");
  const [locationStatus, setLocationStatus] = useState("Tap Use my location to map your nearest tracked city.");
  const [userLocation, setUserLocation] = useState(null);
  const { loading, dataSource, error: stationError, selectedStation, selectedStationId, setSelectedStationId, stations } = useStations();
  const { isSubmittingReport, reportStatus, reports, submitReport } = useCommunityReports();
  const { theme, toggle: toggleTheme } = useTheme();

  const lastUpdatedStation = stations.reduce((latest, station) => {
    const updatedAtMs = parseStationUpdatedAt(station);
    if (updatedAtMs === null) {
      return latest;
    }

    if (!latest || updatedAtMs > latest.updatedAtMs) {
      return { updatedAt: station.updatedAt, updatedAtMs };
    }

    return latest;
  }, null);
  const lastUpdated = lastUpdatedStation?.updatedAt || null;

  const usesWaqi = stations.some((station) => station.dataMode === "waqi");
  const usesForecastApi = stations.some((station) => station.forecastMode === "live");
  const waqiCount = stations.filter((station) => station.dataMode === "waqi").length;
  let apiSummary = "Demo AQI + live weather";

  if (usesWaqi && usesForecastApi) {
    apiSummary = waqiCount === stations.length
      ? "Live AQI + live forecast"
      : `Live AQI (${waqiCount}/${stations.length}) + live forecast`;
  } else if (usesWaqi) {
    apiSummary = "Live AQI + fallback forecast";
  } else if (dataSource === "seed") {
    apiSummary = "Offline — showing demo data";
  }

  async function handleSubmitReport(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const draftReport = {
      id: `draft-${Date.now()}`,
      name: formData.get("name"),
      city: formData.get("city"),
      category: formData.get("category"),
      severity: Number(formData.get("severity")),
      description: formData.get("description"),
      latitude: userLocation?.latitude ?? null,
      longitude: userLocation?.longitude ?? null,
      nearestStationSlug: userLocation?.nearestStationSlug ?? null,
      source: "citizen",
      status: "submitted",
      createdAt: new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
      }).format(new Date()),
    };

    const submission = await submitReport(draftReport);
    if (submission) {
      event.currentTarget.reset();
    }
  }

  function handleUseLocation() {
    if (!navigator.geolocation) {
      setLocationStatus("Geolocation is not available in this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const nearest = nearestStation(coords.latitude, coords.longitude, stations);
        if (nearest) {
          setSelectedStationId(nearest.id);
          setUserLocation({
            latitude: coords.latitude,
            longitude: coords.longitude,
            nearestStationSlug: nearest.id,
          });
          setLocationStatus(`Nearest tracked city detected: ${nearest.city}.`);
        }
      },
      () => {
        setLocationStatus("Location access was denied, so city selection stays manual.");
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Navbar apiSummary={apiSummary} lastUpdated={lastUpdated} theme={theme} onToggleTheme={toggleTheme} />

      <main className="main-shell" id="main-content">
        {loading ? (
          <section className="panel loading-panel" aria-live="polite">
            <p className="panel-kicker">Bootstrapping live feeds</p>
            <h2>Pulling current AQI, weather, and forecast context for India&apos;s major cities.</h2>
          </section>
        ) : (<>
          {(stationError || dataSource === "seed") && (
            <div className="data-warning-banner" role="alert">
              {stationError || "Live data sources are unavailable. Showing demo values — AQI readings may not reflect current conditions."}
            </div>
          )}
          <Routes>
            <Route
              path="/"
              element={
                <HomePage
                  stations={stations}
                  reports={reports}
                  selectedStationId={selectedStationId}
                  onSelectStation={setSelectedStationId}
                />
              }
            />
            <Route
              path="/stations"
              element={
                <StationsPage
                  stations={stations}
                  reports={reports}
                  selectedStationId={selectedStationId}
                  onSelectStation={setSelectedStationId}
                />
              }
            />
            <Route path="/forecast" element={<ForecastPage station={selectedStation} />} />
            <Route
              path="/health"
              element={
                <HealthPage
                  station={selectedStation}
                  profiles={healthProfiles}
                  currentProfile={currentProfile}
                  onChangeProfile={setCurrentProfile}
                />
              }
            />
            <Route
              path="/community"
              element={
                <CommunityPage
                  stations={stations}
                  reports={reports}
                  selectedStationId={selectedStationId}
                  onSelectStation={setSelectedStationId}
                  onSubmitReport={handleSubmitReport}
                  onUseLocation={handleUseLocation}
                  locationStatus={locationStatus}
                  reportStatus={reportStatus}
                  isSubmittingReport={isSubmittingReport}
                />
              }
            />
          </Routes>
        </>)}
      </main>
    </div>
  );
}
