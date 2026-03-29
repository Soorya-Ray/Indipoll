import ProfileAdvisory from "../components/ProfileAdvisory";

export default function HealthPage({ station, profiles, currentProfile, onChangeProfile }) {
  return (
    <div className="page-grid">
      <ProfileAdvisory
        station={station}
        profiles={profiles}
        currentProfile={currentProfile}
        onChangeProfile={onChangeProfile}
      />
    </div>
  );
}
