import { startTransition, useEffect, useState } from "react";
import { seedStations } from "../data/cities";
import { fetchStationsBundle } from "../lib/api";

export function useStations() {
  const [stations, setStations] = useState(seedStations);
  const [selectedStationId, setSelectedStationId] = useState(seedStations[0].id);
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState("seed");
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    async function hydrate() {
      setLoading(true);
      setError(null);
      const result = await fetchStationsBundle(seedStations);

      if (!active) {
        return;
      }

      startTransition(() => {
        setStations(result.stations);
        setDataSource(result.source);
      });
      setLoading(false);
    }

    hydrate().catch((err) => {
      if (active) {
        console.warn("[indipoll] Station hydration failed, showing seed data:", err);
        setError("Could not load live data. Showing demo values.");
        setDataSource("seed");
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const selectedStation = stations.find((station) => station.id === selectedStationId) || stations[0];

  return {
    loading,
    dataSource,
    error,
    selectedStation,
    selectedStationId,
    setSelectedStationId,
    stations,
  };
}
