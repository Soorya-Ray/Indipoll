const REPORTS_KEY = "indipoll-citizen-reports";

export function loadReports(seedReports) {
  try {
    const raw = localStorage.getItem(REPORTS_KEY);
    if (!raw) {
      localStorage.setItem(REPORTS_KEY, JSON.stringify(seedReports));
      return [...seedReports];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : [...seedReports];
  } catch {
    return [...seedReports];
  }
}

export function saveReports(reports) {
  localStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
}
