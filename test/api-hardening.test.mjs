import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readJson = async (response) => {
  const payload = await response.json();
  if (!response.ok) {
    const message = typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
};

const findOpenPort = async () => {
  const net = await import("node:net");
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to resolve open port")));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
};

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "emerald-hardening-test-"));
const dbPath = path.join(tempDir, "app.db");
const runtimeStorePath = path.join(tempDir, "runtime-store.json");

let apiPort = 0;
let apiBase = "";
let server = null;
let authToken = "";

test.before(async () => {
  apiPort = await findOpenPort();
  apiBase = `http://127.0.0.1:${apiPort}`;
  server = spawn("node", ["server/api.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      API_PORT: String(apiPort),
      FEEDBACK_DB_PATH: dbPath,
      FLAT_RUNTIME_STORE_PATH: runtimeStorePath,
      SYNTHESIS_PIN: "2468",
      FEEDBACK_DATA_SOURCE: "flat",
      FEEDBACK_DB_ENGINE: "sqlite",
      API_ALLOWED_ORIGIN: "http://localhost:4000",
      API_MAX_BODY_BYTES: "262144",
      API_RATE_LIMIT_WRITES_PER_MINUTE: "240",
      API_RATE_LIMIT_SYNTHESIS_PER_MINUTE: "30",
      API_RATE_LIMIT_AUTH_PER_MINUTE: "40",
    },
    stdio: "pipe",
  });

  let ready = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${apiBase}/health`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // continue polling
    }
    await wait(100);
  }
  if (!ready) {
    throw new Error("API server did not start in time.");
  }
});

test.after(async () => {
  if (server && !server.killed) {
    server.kill("SIGTERM");
    await wait(120);
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("API contract: health and bootstrap endpoints respond", async () => {
  const health = await readJson(await fetch(`${apiBase}/health`));
  assert.equal(health.ok, true);
  assert.ok(["db", "flat"].includes(String(health.dataSourceMode ?? "db")));

  const bootstrap = await readJson(await fetch(`${apiBase}/api/bootstrap`));
  assert.ok(Array.isArray(bootstrap.products));
  assert.ok(Array.isArray(bootstrap.featureRequests));
});

test("Synthesis auth gate requires PIN and returns bearer token", async () => {
  const unauthorized = await fetch(`${apiBase}/api/session/config`);
  assert.equal(unauthorized.status, 401);

  const authResponse = await readJson(
    await fetch(`${apiBase}/api/synthesis/auth`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin: "2468" }),
    }),
  );

  assert.equal(authResponse.authenticated, true);
  assert.equal(typeof authResponse.token, "string");
  authToken = String(authResponse.token);
  assert.ok(authToken.length >= 40);

  const config = await readJson(
    await fetch(`${apiBase}/api/session/config`, {
      headers: { authorization: `Bearer ${authToken}` },
    }),
  );
  assert.equal(typeof config.inputWindowOpen, "boolean");
});

test("Submission flow: feature request, upvote, comment, and screen feedback", async () => {
  const headers = {
    authorization: `Bearer ${authToken}`,
    "content-type": "application/json",
  };

  const createdFeature = await readJson(
    await fetch(`${apiBase}/api/feature-requests`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        productId: 1,
        title: "Add lifecycle alerts",
        workflowContext: "Nightly batch monitoring",
        origin: "kiosk",
      }),
    }),
  );
  assert.equal(createdFeature.ok, true);
  assert.ok(["number", "string"].includes(typeof createdFeature.id));

  const upvote = await readJson(
    await fetch(`${apiBase}/api/feature-requests/${createdFeature.id}/upvote`, {
      method: "POST",
      headers,
      body: JSON.stringify({ sessionId: "test-session" }),
    }),
  );
  assert.equal(upvote.ok, true);
  assert.ok(Number(upvote.votes) >= 2);

  const comment = await readJson(
    await fetch(`${apiBase}/api/kudos`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        productId: 1,
        text: "Great workflow for onboarding.",
        role: "ops",
        consentPublic: true,
      }),
    }),
  );
  assert.equal(comment.ok, true);

  const screenFeedback = await readJson(
    await fetch(`${apiBase}/api/screen-feedback`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        productId: 1,
        app: "servicing",
        screenName: "EIR Fees",
        type: "suggestion",
        text: "Expose fee explanations inline.",
      }),
    }),
  );
  assert.equal(screenFeedback.ok, true);

  const counts = await readJson(
    await fetch(`${apiBase}/api/inputs/count`, {
      headers: { authorization: `Bearer ${authToken}` },
    }),
  );
  assert.ok(Number(counts.totalInputs) >= 3);
});

test("Validation and synthesis route hardening works end-to-end", async () => {
  const badFeatureRequest = await fetch(`${apiBase}/api/feature-requests`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${authToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      productId: 1,
      title: "",
    }),
  });
  assert.equal(badFeatureRequest.status, 400);

  const synthesisBadMode = await fetch(`${apiBase}/api/synthesis/stream`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${authToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ outputMode: "invalid-mode" }),
  });
  assert.equal(synthesisBadMode.status, 400);
});
