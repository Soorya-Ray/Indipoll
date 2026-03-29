import { getSeverity } from "./IndiaMap";

export default function ProfileAdvisory({ station, profiles, currentProfile, onChangeProfile }) {
  const profile = profiles[currentProfile];
  const severity = getSeverity(station.aqi);
  const avoidOutdoor = station.aqi > 180 || ["Very poor", "Severe", "Hazardous"].includes(severity.label);

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">Profile-based health guidance</p>
          <h2>Advisories for {station.city}</h2>
        </div>
        <div className="profile-switcher">
          {Object.entries(profiles).map(([key, item]) => (
            <button
              key={key}
              type="button"
              className={`profile-pill${currentProfile === key ? " active" : ""}`}
              onClick={() => onChangeProfile(key)}
              aria-pressed={currentProfile === key}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="advisory-card">
        <div className="advisory-title">
          <h3>{profile.label} guidance</h3>
          <span className="advisory-level">{profile.tone}</span>
        </div>
        <p>{profile.copy}</p>
        <p>
          Current station condition is <strong>{severity.label.toLowerCase()}</strong> at AQI {station.aqi}.{" "}
          {avoidOutdoor
            ? "Outdoor activity should be minimized until the forecast relaxes."
            : "Short outdoor activity is acceptable with route choice and timing awareness."}
        </p>
        <ul className="advisory-list">
          {profile.actions.map((action) => (
            <li key={action}>{action}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
