import ForecastChart from "../components/ForecastChart";
import { buildModelQualitySummary } from "../lib/model-evaluation";

export default function ForecastPage({ station }) {
  const quality = buildModelQualitySummary(station.model);

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
            <div className="insight-list">
              {station.shap.map((insight) => (
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
