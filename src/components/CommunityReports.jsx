export default function CommunityReports({
  stations,
  reports,
  onSubmitReport,
  onUseLocation,
  locationStatus,
  reportStatus,
  isSubmittingReport,
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">Participatory sensing layer</p>
          <h2>Citizen pollution reports</h2>
        </div>
      </div>

      <div className="citizen-layout">
        <form className="report-form" onSubmit={onSubmitReport}>
          <label htmlFor="reporter-name">
            Name
            <input
              id="reporter-name"
              type="text"
              name="name"
              placeholder="Resident, volunteer, journalist…"
              autoComplete="name"
              required
            />
          </label>
          <label htmlFor="report-city">
            City
            <select id="report-city" name="city" defaultValue={stations[0]?.city}>
              {stations.map((station) => (
                <option key={station.id} value={station.city}>
                  {station.city}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="report-category">
            Observation type
            <select id="report-category" name="category" defaultValue="Construction dust">
              <option value="Construction dust">Construction dust</option>
              <option value="Vehicular congestion">Vehicular congestion</option>
              <option value="Waste burning">Waste burning</option>
              <option value="Industrial smoke">Industrial smoke</option>
              <option value="Crop residue smoke">Crop residue smoke</option>
            </select>
          </label>
          <label htmlFor="report-severity">
            Severity
            <input id="report-severity" type="range" name="severity" min="1" max="5" step="1" defaultValue="3" />
          </label>
          <label htmlFor="report-description">
            Description
            <textarea
              id="report-description"
              name="description"
              rows="4"
              placeholder="What are you seeing, smelling, or experiencing right now?…"
              required
            />
          </label>
          <div className="form-actions">
            <button type="submit" className="primary-action" disabled={isSubmittingReport}>
              {isSubmittingReport ? "Publishing…" : "Publish Report"}
            </button>
            <button type="button" className="secondary-action" onClick={onUseLocation}>
              Use My Location
            </button>
          </div>
          <p className="form-note" aria-live="polite">
            {reportStatus}
          </p>
          <p className="form-note">
            Reports sync to Supabase when available and fall back to browser storage during outages. {locationStatus}
          </p>
        </form>

        <section className="subpanel report-feed">
          <div className="subpanel-heading">
            <h3>Community feed</h3>
            <p>Newest participatory sensing events</p>
          </div>
          <div className="report-feed-list">
            {reports
              .slice()
              .reverse()
              .map((report) => (
                <article className="feed-item" key={report.id}>
                  <div className="feed-item-meta">
                    {report.createdAt} · {report.city}
                  </div>
                  <strong>
                    {report.name} reported {report.category}
                  </strong>
                  <div className="feed-badge">Severity {report.severity}/5</div>
                  <p>{report.description}</p>
                </article>
              ))}
          </div>
        </section>
      </div>
    </section>
  );
}
