import CommunityReports from "../components/CommunityReports";
import IndiaMap from "../components/IndiaMap";

export default function CommunityPage({
  stations,
  reports,
  selectedStationId,
  onSelectStation,
  onSubmitReport,
  onUseLocation,
  locationStatus,
  reportStatus,
  isSubmittingReport,
}) {
  return (
    <div className="page-grid">
      <IndiaMap
        stations={stations}
        reports={reports}
        selectedStationId={selectedStationId}
        onSelectStation={onSelectStation}
      />
      <CommunityReports
        stations={stations}
        reports={reports}
        onSubmitReport={onSubmitReport}
        onUseLocation={onUseLocation}
        locationStatus={locationStatus}
        reportStatus={reportStatus}
        isSubmittingReport={isSubmittingReport}
      />
    </div>
  );
}
