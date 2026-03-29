import IndiaMap from "../components/IndiaMap";
import StationPanel from "../components/StationPanel";

export default function StationsPage({ stations, reports, selectedStationId, onSelectStation }) {
  const station = stations.find((item) => item.id === selectedStationId) || stations[0];

  return (
    <div className="page-grid">
      <IndiaMap
        stations={stations}
        reports={reports}
        selectedStationId={selectedStationId}
        onSelectStation={onSelectStation}
      />
      <StationPanel station={station} />
    </div>
  );
}
