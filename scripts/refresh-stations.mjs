import fs from "node:fs/promises";
import path from "node:path";
async function loadLocalEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  let text = "";

  try {
    text = await fs.readFile(envPath, "utf8");
  } catch {
    return;
  }

  text.split(/\r?\n/).forEach((line) => {
    if (!line || line.trim().startsWith("#")) {
      return;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      return;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  });
}

async function main() {
  await loadLocalEnv();

  process.env.CRON_SECRET = process.env.CRON_SECRET || "local-refresh-secret";
  const { default: handler } = await import("../api/refresh-stations.js");

  const request = {
    method: "GET",
    headers: {
      authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
  };

  const response = {
    statusCode: 200,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      console.log(JSON.stringify({ statusCode: this.statusCode, payload }, null, 2));
      return payload;
    },
  };

  await handler(request, response);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
