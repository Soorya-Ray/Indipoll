import { Link } from "react-router-dom";
import IndiaMap, { getSeverity } from "../components/IndiaMap";

export default function HomePage({ stations, reports, selectedStationId, onSelectStation }) {
  const averageAqi = Math.round(stations.reduce((sum, station) => sum + station.aqi, 0) / stations.length);
  const topCity = stations.slice().sort((a, b) => b.aqi - a.aqi)[0];
  const selectedStation = stations.find((station) => station.id === selectedStationId) || stations[0];

  return (
    <div className="page-grid">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">National air quality intelligence platform</p>
          <h2 className="hero-title">India's air, explained in real time and projected 72 hours ahead.</h2>
          <p className="hero-text">
            Indipoll combines live AQI, pollutant drivers, source attribution, personalized health guidance, and
            community sensing across India&apos;s biggest urban centers.
          </p>
          <div className="hero-actions">
            <Link className="primary-action" to="/stations">
              Explore stations
            </Link>
            <Link className="secondary-action" to="/forecast">
              Open forecast lab
            </Link>
          </div>
        </div>

        <section className="hero-summary">
          <div className="summary-card">
            <span>National mean AQI</span>
            <strong>{averageAqi}</strong>
            <small>Across tracked metros</small>
          </div>
          <div className="summary-card">
            <span>Most stressed city</span>
            <strong>{topCity.city}</strong>
            <small>
              AQI {topCity.aqi} · {getSeverity(topCity.aqi).label}
            </small>
          </div>
          <div className="summary-card">
            <span>Citizen alerts</span>
            <strong>{reports.length}</strong>
            <small>Recent participatory reports</small>
          </div>
        </section>
      </section>

      <IndiaMap
        stations={stations}
        reports={reports}
        selectedStationId={selectedStationId}
        onSelectStation={onSelectStation}
      />

      <section className="panel quick-grid">
        <div className="subpanel">
          <div className="subpanel-heading">
            <h3>{selectedStation.city} right now</h3>
            <p>Selected city from the live map</p>
          </div>
          <div className="snapshot-list">
            <div className="snapshot-row">
              <span>AQI</span>
              <strong>{selectedStation.aqi}</strong>
            </div>
            <div className="snapshot-row">
              <span>Primary pollutant</span>
              <strong>
                {Object.entries(selectedStation.pollutants).sort((a, b) => b[1] - a[1])[0]?.[0].replace("_", ".")}
              </strong>
            </div>
            <div className="snapshot-row">
              <span>Weather</span>
              <strong>{selectedStation.weather?.Temperature}</strong>
            </div>
          </div>
        </div>

        <div className="subpanel">
          <div className="subpanel-heading">
            <h3>What This Build Connects To</h3>
            <p>Production-ready services behind the UI</p>
          </div>
          <div className="capability-list">
            <div>WAQI token for real-time AQI and pollutant snapshots</div>
            <div>Open-Meteo for live current weather</div>
            <div>Custom forecast API for LSTM output and SHAP narratives</div>
            <div>Supabase for community report persistence and retrieval</div>
            <div>Browser geolocation for nearest-city reporting</div>
          </div>
        </div>
      </section>
    </div>
  );
}
