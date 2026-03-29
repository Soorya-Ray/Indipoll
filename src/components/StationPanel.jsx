import { getSeverity } from "./IndiaMap";

function MetricRows({ metrics, formatter = (value) => `${value}%` }) {
  return (
    <div className="metric-stack">
      {Object.entries(metrics)
        .sort((a, b) => b[1] - a[1])
        .map(([label, value], index) => (
          <div className="metric-row" key={label}>
            <div className="metric-label">
              <span>{label.replace("_", ".")}</span>
              <strong>{formatter(value)}</strong>
            </div>
            <div className="metric-track">
              <div
                className="metric-fill"
                style={{
                  width: `${Math.min(value, 100)}%`,
                  background:
                    index % 2 === 0
                      ? "linear-gradient(90deg, #8bf0c4, rgba(255,255,255,0.18))"
                      : "linear-gradient(90deg, #f4c25b, rgba(255,255,255,0.18))",
                }}
              />
            </div>
          </div>
        ))}
    </div>
  );
}

export default function StationPanel({ station }) {
  const severity = getSeverity(station.aqi);
  const topPollutant = Object.entries(station.pollutants).sort((a, b) => b[1] - a[1])[0]?.[0] || "PM2.5";

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">Station intelligence</p>
          <h2>{station.city}</h2>
        </div>
        <div className="aqi-badge" style={{ background: severity.color }}>
          AQI {station.aqi} · {severity.label}
        </div>
      </div>

      <div className="detail-meta">
        <div>
          <span>Station</span>
          <strong>{station.station}</strong>
        </div>
        <div>
          <span>Primary pollutant</span>
          <strong>{topPollutant.replace("_", ".")}</strong>
        </div>
        <div>
          <span>Last updated</span>
          <strong>{station.updatedAt}</strong>
        </div>
      </div>

      <div className="detail-grid">
        <section className="subpanel">
          <div className="subpanel-heading">
            <h3>Pollutant drivers</h3>
            <p>Relative intensity from the current snapshot</p>
          </div>
          <MetricRows metrics={station.pollutants} />
        </section>

        <section className="subpanel">
          <div className="subpanel-heading">
            <h3>Source attribution</h3>
            <p>Estimated share of local air burden</p>
          </div>
          <MetricRows metrics={station.sources} />
        </section>

        <section className="subpanel">
          <div className="subpanel-heading">
            <h3>Current weather</h3>
            <p>Context for pollutant buildup and dispersion</p>
          </div>
          <div className="weather-grid">
            {Object.entries(station.weather).map(([label, value]) => (
              <div className="weather-stat" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
