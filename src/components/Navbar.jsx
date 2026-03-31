import { NavLink } from "react-router-dom";

const links = [
  { to: "/", label: "Overview" },
  { to: "/stations", label: "Stations" },
  { to: "/forecast", label: "Forecast Lab" },
  { to: "/health", label: "Health Guidance" },
  { to: "/community", label: "Community" },
];

export default function Navbar({ apiSummary, lastUpdated, theme, onToggleTheme }) {
  return (
    <header className="topbar">
      <div className="brand-block">
        <div className="brand-mark">I</div>
        <div>
          <p className="eyebrow">National Air Quality Intelligence</p>
          <h1 className="brand-title">Indipoll</h1>
        </div>
      </div>

      <nav className="nav-links" aria-label="Main navigation">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === "/"}
            className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
          >
            {link.label}
          </NavLink>
        ))}
      </nav>

      <div className="topbar-right">
        <div className="status-pill" aria-live="polite">
          <span>Data mode</span>
          <strong>{apiSummary}</strong>
          {lastUpdated ? <span className="last-updated">Updated {lastUpdated}</span> : null}
        </div>
        <button
          type="button"
          className="theme-toggle"
          onClick={onToggleTheme}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? "\u2600" : "\u263D"}
        </button>
      </div>
    </header>
  );
}
