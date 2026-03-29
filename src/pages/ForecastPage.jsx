import ForecastChart from "../components/ForecastChart";

export default function ForecastPage({ station }) {
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
        {station.model?.evaluation ? (
          <div className="model-note">
            <span>Backtest</span>
            <strong>RMSE {station.model.evaluation.rmse}</strong>
            <em>
              {station.model.evaluation.persistenceDelta > 0 ? `${station.model.evaluation.persistenceDelta}% better` : "Parity"}
              {" vs persistence"}
            </em>
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
      </section>
    </div>
  );
}
