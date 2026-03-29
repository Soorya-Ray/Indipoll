import { NavLink } from "react-router-dom";

const links = [
  { to: "/", label: "Overview" },
  { to: "/stations", label: "Stations" },
  { to: "/forecast", label: "Forecast Lab" },
  { to: "/health", label: "Health Guidance" },
  { to: "/community", label: "Community" },
];

export default function Navbar({ apiSummary }) {
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

      <div className="status-pill" aria-live="polite">
        <span>Data mode</span>
        <strong>{apiSummary}</strong>
      </div>
    </header>
  );
}
