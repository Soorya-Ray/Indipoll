import { useEffect, useState } from "react";
import { seedReports } from "../data/cities";
import { createCommunityReport, fetchCommunityReports, subscribeToCommunityReports } from "../lib/reports";
import { saveReports } from "../lib/storage";

export function useCommunityReports() {
  const [reports, setReports] = useState(seedReports);
  const [reportStatus, setReportStatus] = useState("Connecting to live feeds and community reports…");
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  useEffect(() => {
    let active = true;

    async function hydrateReports() {
      try {
        const nextReports = await fetchCommunityReports(seedReports);
        if (active) {
          setReports(nextReports);
          setReportStatus("Community reports are synced and ready.");
        }
      } catch {
        if (active) {
          setReportStatus("Live sync is unavailable, so reports stay local in this browser.");
        }
      }
    }

    hydrateReports();

    let unsubscribe = () => {};
    subscribeToCommunityReports((nextReport) => {
      if (!active) {
        return;
      }

      setReports((currentReports) => {
        if (currentReports.some((report) => report.id === nextReport.id)) {
          return currentReports;
        }

        const syncedReports = [...currentReports, nextReport];
        saveReports(syncedReports);
        return syncedReports;
      });
    }).then((cleanup) => {
      unsubscribe = cleanup;
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  function appendReport(nextReport) {
    setReports((currentReports) => {
      if (currentReports.some((report) => report.id === nextReport.id)) {
        return currentReports;
      }

      const nextReports = [...currentReports, nextReport];
      saveReports(nextReports);
      return nextReports;
    });
  }

  async function submitReport(report) {
    setIsSubmittingReport(true);

    try {
      const persistedReport = await createCommunityReport(report);
      appendReport(persistedReport);
      setReportStatus("Report published and synced.");
      return { ok: true };
    } catch {
      appendReport(report);
      setReportStatus("Report saved locally because the cloud sync is unavailable.");
      return { ok: false };
    } finally {
      setIsSubmittingReport(false);
    }
  }

  return {
    isSubmittingReport,
    reportStatus,
    reports,
    submitReport,
  };
}
