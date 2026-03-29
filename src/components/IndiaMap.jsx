import { MapContainer, TileLayer, CircleMarker, Popup, Pane, useMap } from "react-leaflet";

function getSeverity(aqi) {
  if (aqi <= 50) return { label: "Good", color: "#2fb36d" };
  if (aqi <= 100) return { label: "Satisfactory", color: "#7cc85d" };
  if (aqi <= 200) return { label: "Moderate", color: "#d9c94a" };
  if (aqi <= 300) return { label: "Poor", color: "#f59f3a" };
  if (aqi <= 400) return { label: "Very poor", color: "#d94841" };
  if (aqi <= 500) return { label: "Severe", color: "#7f2b7b" };
  return { label: "Hazardous", color: "#5b0b16" };
}

const INDIA_BOUNDS = [
  [6.0, 67.0],
  [37.5, 97.5],
];

function MapViewport({ selectedStation }) {
  const map = useMap();

  if (selectedStation) {
    map.flyTo([selectedStation.lat, selectedStation.lon], 6, {
      animate: true,
      duration: 0.8,
    });
  } else {
    map.fitBounds(INDIA_BOUNDS, { padding: [24, 24] });
  }

  return null;
}

export { getSeverity };

export default function IndiaMap({ stations, reports, selectedStationId, onSelectStation }) {
  const selectedStation = stations.find((station) => station.id === selectedStationId) || stations[0];

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">Live station map</p>
          <h2>Interactive India basemap with real station geography</h2>
        </div>
        <div className="legend">
          {["Good", "Moderate", "Poor", "Very poor", "Severe", "Hazardous"].map((label) => (
            <span key={label}>
              <i
                aria-hidden="true"
                style={{
                  background: getSeverity(
                    { Good: 50, Moderate: 180, Poor: 260, "Very poor": 360, Severe: 450, Hazardous: 550 }[label],
                  ).color,
                }}
              />
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="map-stage map-stage--leaflet">
        <MapContainer
          className="india-map india-map--leaflet"
          center={[22.7, 79.5]}
          zoom={5}
          minZoom={4}
          maxZoom={9}
          maxBounds={INDIA_BOUNDS}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />

          <Pane name="reports" style={{ zIndex: 420 }} />
          <Pane name="stations" style={{ zIndex: 500 }} />

          <MapViewport selectedStation={selectedStation} />

          {stations.map((station) => {
            const severity = getSeverity(station.aqi);
            const isSelected = station.id === selectedStationId;

            return (
              <CircleMarker
                key={station.id}
                center={[station.lat, station.lon]}
                eventHandlers={{
                  click: () => onSelectStation(station.id),
                }}
                fillColor={severity.color}
                fillOpacity={0.88}
                pane="stations"
                pathOptions={{
                  color: isSelected ? "#f4c25b" : "#f3f7f4",
                  opacity: isSelected ? 1 : 0.7,
                  weight: isSelected ? 3 : 1.5,
                }}
                radius={Math.max(8, Math.min(20, 6 + station.aqi / 18))}
              >
                <Popup>
                  <div className="map-popup">
                    <strong>{station.city}</strong>
                    <span>{station.station}</span>
                    <span>
                      AQI {station.aqi} · {severity.label}
                    </span>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}

          {reports.slice(-16).map((report) => {
            const reportStation =
              stations.find((station) => station.id === report.nearestStationSlug) ||
              stations.find((station) => station.city === report.city) ||
              selectedStation;

            if (!reportStation) {
              return null;
            }

            const lat = report.latitude ?? reportStation.lat + 0.22;
            const lon = report.longitude ?? reportStation.lon + 0.22;

            return (
              <CircleMarker
                key={report.id}
                center={[lat, lon]}
                fillColor="#f4c25b"
                fillOpacity={0.38}
                pane="reports"
                pathOptions={{
                  color: "#f4c25b",
                  dashArray: "2 4",
                  weight: 2,
                }}
                radius={6 + Number(report.severity || 1)}
              >
                <Popup>
                  <div className="map-popup">
                    <strong>{report.category}</strong>
                    <span>{report.city}</span>
                    <span>{report.description}</span>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
    </section>
  );
}
