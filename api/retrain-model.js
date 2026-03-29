import { runTrainingPipeline } from "../scripts/train-lstm.mjs";

const CRON_SECRET = process.env.CRON_SECRET || "";

function isAuthorized(request) {
  const header = request.headers.authorization || request.headers.Authorization || "";
  return CRON_SECRET && header === `Bearer ${CRON_SECRET}`;
}

export default async function handler(request, response) {
  if (!["GET", "POST"].includes(request.method || "GET")) {
    response.setHeader("Allow", "GET, POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  if (!isAuthorized(request)) {
    return response.status(401).json({ error: "Unauthorized" });
  }

  try {
    const result = await runTrainingPipeline({ writeLocalArtifact: false });
    console.log(
      JSON.stringify({
        event: "model_retrain_complete",
        version: result.artifact.version,
        promotion: result.artifact.promotion,
        evaluation: result.artifact.evaluationSummary,
      }),
    );
    return response.status(200).json({
      retrained: true,
      version: result.artifact.version,
      promotion: result.artifact.promotion,
      evaluation: result.artifact.evaluationSummary,
      trainedAt: result.artifact.trainedAt,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "model_retrain_failed",
        error: error instanceof Error ? error.message : "Unknown retraining error",
      }),
    );
    return response.status(500).json({
      error: error instanceof Error ? error.message : "Model retraining failed",
    });
  }
}
