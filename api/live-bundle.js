import { buildStationBundle } from "./_shared/live-data.js";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed" });
  }

  try {
    const stations = await buildStationBundle();
    response.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=900");
    return response.status(200).json({
      generatedAt: new Date().toISOString(),
      stations,
    });
  } catch (error) {
    return response.status(500).json({
      error: error instanceof Error ? error.message : "Failed to build live bundle",
    });
  }
}
