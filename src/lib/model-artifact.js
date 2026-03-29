import defaultModelArtifact from "../data/ml-model-artifact.generated.js";

export function resolveModelArtifact(artifact) {
  return artifact || defaultModelArtifact;
}
