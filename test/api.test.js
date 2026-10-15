const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");

const PORT = 20000 + Math.floor(Math.random() * 10000);
const API = "http://127.0.0.1:" + PORT;
let child;

test.before(async () => {
  child = spawn(process.execPath, ["server.js"], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: "pipe",
  });
  for (let attempt = 0; attempt < 50; attempt++) {
    if (child.exitCode !== null) throw new Error("Backend failed to start");
    try {
      const response = await fetch(API + "/api/health");
      if (response.ok) return;
    } catch {
      // Wait for Express to start listening.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Backend did not start");
});

test.after(() => {
  if (child) child.kill();
});

test("health endpoint is available", async () => {
  const response = await fetch(API + "/api/health");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
});

test("search requires a non-empty term", async () => {
  const response = await fetch(API + "/api/all-artworks");
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /search term/i);
});

test("search rejects invalid pages", async () => {
  for (const page of ["0", "-1", "2.2", "abc", "10001"]) {
    const response = await fetch(API + "/api/all-artworks?q=flower&page=" + page);
    assert.equal(response.status, 400, "page=" + page);
  }
});

test("search rejects unreasonable result counts", async () => {
  for (const minResults of ["0", "100", "2.5"]) {
    const response = await fetch(API + "/api/all-artworks?q=flower&minResults=" + minResults);
    assert.equal(response.status, 400, "minResults=" + minResults);
  }
});

test("search rejects invalid ordering", async () => {
  const response = await fetch(API + "/api/all-artworks?q=flower&sortOrder=arbitrary");
  assert.equal(response.status, 400);
});

test("artwork lookup rejects malformed IDs", async () => {
  const response = await fetch(API + "/api/artwork/bad%20id");
  assert.equal(response.status, 400);
});
