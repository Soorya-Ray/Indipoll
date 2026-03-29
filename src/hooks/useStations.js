import { startTransition, useEffect, useState } from "react";
import { seedStations } from "../data/cities";
import { fetchStationsBundle } from "../lib/api";

export function useStations() {
  const [stations, setStations] = useState(seedStations);
  const [selectedStationId, setSelectedStationId] = useState(seedStations[0].id);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function hydrate() {
      setLoading(true);
      const snapshots = await fetchStationsBundle(seedStations);

      if (!active) {
        return;
      }

      startTransition(() => {
        setStations(snapshots);
      });
      setLoading(false);
    }

    hydrate().catch(() => {
      if (active) {
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
    selectedStation,
    selectedStationId,
    setSelectedStationId,
    stations,
  };
}
