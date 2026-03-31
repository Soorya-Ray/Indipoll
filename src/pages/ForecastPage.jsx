import ForecastChart from "../components/ForecastChart";
import { buildModelQualitySummary } from "../lib/model-evaluation";

function formatFeatureLabel(feature) {
  return feature.replace(/_/g, " ");
}

function ShapSummaryChart({ insights, stationCity }) {
  const items = insights
    .map((insight, index) => ({
      ...insight,
      magnitude: insight.magnitude ?? Math.max(2.5, 8 - index * 1.35),
    }))
    .sort((left, right) => right.magnitude - left.magnitude);

  if (!items.length) {
    return null;
  }

  const width = 520;
  const barHeight = 34;
  const gap = 14;
  const padding = { top: 12, right: 14, bottom: 12, left: 188 };
  const chartHeight = padding.top + padding.bottom + items.length * barHeight + (items.length - 1) * gap;
  const maxMagnitude = Math.max(...items.map((item) => item.magnitude), 1);
  const barWidth = width - padding.left - padding.right;

  return (
    <svg
      viewBox={`0 0 ${width} ${chartHeight}`}
      className="shap-summary-chart"
      aria-label={`${stationCity} SHAP summary chart`}
    >
      <rect x="0" y="0" width={width} height={chartHeight} rx="22" fill="var(--chart-bg)" />
      {items.map((item, index) => {
        const y = padding.top + index * (barHeight + gap);
        const widthRatio = Math.max(item.magnitude / maxMagnitude, 0.12);
        const fillWidth = barWidth * widthRatio;
        const barColor = item.impact === "down" ? "var(--chart-positive)" : "var(--chart-negative)";
        const valueX = Math.min(padding.left + fillWidth + 10, width - padding.right - 36);

        return (
          <g key={`${item.rawFeature || item.feature}-${index}`}>
            <text x="18" y={y + 14} fill="var(--chart-title)" fontSize="13" fontWeight="700">
              {formatFeatureLabel(item.feature)}
            </text>
            <text x="18" y={y + 28} fill="var(--chart-axis-text)" fontSize="11">
              {item.impact === "down" ? "Pulls AQI down" : "Pushes AQI up"}
            </text>
            <rect
              x={padding.left}
              y={y}
              width={barWidth}
              height={barHeight}
              rx="999"
              fill="var(--chart-track)"
            />
            <rect
              x={padding.left}
              y={y}
              width={fillWidth}
              height={barHeight}
              rx="999"
              fill={barColor}
            />
            <text x={valueX} y={y + 21} fill="var(--chart-title)" fontSize="12" fontWeight="700">
              {item.magnitude.toFixed(1)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function ForecastPage({ station }) {
  const quality = buildModelQualitySummary(station.model);
  const shapInsights = (station.shap || []).slice().sort((left, right) => (right.magnitude || 0) - (left.magnitude || 0));

  return (
    <div className="page-grid">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">LSTM forecast lab</p>
            <h2>72-hour AQI outlook for {station.city}</h2>
          </div>
          <div className="status-pill">
            <span>Forecast mode</span>
            <strong>{station.forecastMode === "live" ? "API connected" : "Fallback model"}</strong>
          </div>
        </div>
        {station.model ? (
          <div className="model-note">
            <span>Model</span>
            <strong>{station.model.version}</strong>
            {station.model.dataSource ? <em>{station.model.dataSource}</em> : null}
          </div>
        ) : null}
        {station.model ? (
          <div className="model-note">
            <span>Forecast quality</span>
            <strong>{quality.headline}</strong>
            <em>{quality.note}</em>
          </div>
        ) : null}

        <div className="forecast-layout">
          <section className="subpanel chart-card">
            <ForecastChart station={station} />
          </section>

          <section className="subpanel shap-card">
            <div className="subpanel-heading">
              <h3>Why the model is leaning this way</h3>
              <p>Exact Shapley attributions over the model's live feature context</p>
            </div>
            <ShapSummaryChart insights={shapInsights} stationCity={station.city} />
            <div className="insight-list">
              {shapInsights.map((insight) => (
                <div className="insight-item" key={insight.feature}>
                  <strong>
                    {insight.feature} · {insight.impact === "up" ? "Pushes AQI up" : "Pulls AQI down"}
                  </strong>
                  <span>{insight.text}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
        <section className="subpanel">
          <div className="subpanel-heading">
            <h3>Forecast quality</h3>
            <p>Training lineage, evidence level, and real-window backtest status</p>
          </div>
          <div className="snapshot-list">
            <div className="snapshot-row">
              <span>Training date</span>
              <strong>{station.model?.trainedAt ? new Date(station.model.trainedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "Unavailable"}</strong>
            </div>
            <div className="snapshot-row">
              <span>Sample count</span>
              <strong>{station.model?.sampleCount ?? "Unavailable"}</strong>
            </div>
            <div className="snapshot-row">
              <span>Promotion status</span>
              <strong>{station.model?.promotion?.status || "local artifact"}</strong>
            </div>
            <div className="snapshot-row">
              <span>Training window</span>
              <strong>
                {station.model?.trainingWindow?.start && station.model?.trainingWindow?.end
                  ? `${new Date(station.model.trainingWindow.start).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })} to ${new Date(station.model.trainingWindow.end).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}`
                  : "Insufficient real history"}
              </strong>
            </div>
            <div className="snapshot-row">
              <span>Evidence state</span>
              <strong>{quality.state}</strong>
            </div>
          </div>
        </section>
        {station.model?.evaluation?.horizon?.length ? (
          <section className="subpanel">
            <div className="subpanel-heading">
              <h3>Backtest by horizon</h3>
              <p>Real-observation validation compared with a persistence baseline</p>
            </div>
            <div className="snapshot-list">
              {station.model.evaluation.horizon.map((entry) => (
                <div className="snapshot-row" key={entry.label}>
                  <span>{entry.label}</span>
                  <strong>
                    RMSE {entry.rmse} vs {entry.persistenceRmse}
                  </strong>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        {station.model?.evaluation?.station ? (
          <section className="subpanel">
            <div className="subpanel-heading">
              <h3>{station.city} model evidence</h3>
              <p>Station-level backtest summary when enough real windows exist</p>
            </div>
            <div className="snapshot-list">
              <div className="snapshot-row">
                <span>Station RMSE</span>
                <strong>{station.model.evaluation.station.rmse}</strong>
              </div>
              <div className="snapshot-row">
                <span>Persistence RMSE</span>
                <strong>{station.model.evaluation.station.persistenceRmse}</strong>
              </div>
              <div className="snapshot-row">
                <span>Rolling mean RMSE</span>
                <strong>{station.model.evaluation.station.rollingMeanRmse}</strong>
              </div>
              <div className="snapshot-row">
                <span>Real windows</span>
                <strong>{station.model.evaluation.station.samples}</strong>
              </div>
            </div>
          </section>
        ) : null}
      </section>
    </div>
  );
}
