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

function ForecastSparkline({ values, label }) {
  if (!values?.length) {
    return null;
  }

  const width = 260;
  const height = 72;
  const padding = 6;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = Math.max(max - min, 1);
  const x = (index) => padding + (index / Math.max(values.length - 1, 1)) * (width - padding * 2);
  const y = (value) => height - padding - ((value - min) / range) * (height - padding * 2);
  const path = values.map((value, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(value)}`).join(" ");

  return (
    <div className="station-trend">
      <div className="station-trend-header">
        <div>
          <h3>72-hour trend</h3>
          <p>Current forecast path from the selected station model</p>
        </div>
        <strong>
          {values[0]} to {values[values.length - 1]} AQI
        </strong>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="station-trend-chart" aria-label={label}>
        <rect x="0" y="0" width={width} height={height} rx="18" fill="var(--chart-bg)" />
        <path d={path} fill="none" stroke="var(--chart-line)" strokeWidth="3.5" strokeLinecap="round" />
        {values.map((value, index) => (
          <circle
            key={`${index}-${value}`}
            cx={x(index)}
            cy={y(value)}
            r={index === values.length - 1 ? 4.5 : 3}
            fill={index === values.length - 1 ? "var(--chart-point-current)" : "var(--chart-point)"}
          />
        ))}
      </svg>
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
          <ForecastSparkline
            values={station.forecast?.values || []}
            label={`${station.city} forecast trend`}
          />
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
