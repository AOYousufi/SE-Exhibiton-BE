const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { spawn } = require("node:child_process");

let museum;
let backend;
let apiBase;
const requests = [];

const sendJson = (res, body, status = 200) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

test.before(async () => {
  museum = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    requests.push(url);
    const page = Number(url.searchParams.get("page") || "1");
    if (url.pathname === "/harvard/object") {
      return sendJson(res, {
        info: { pages: 2 },
        records: [{
          objectid: 1000 + page,
          title: "Harvard artwork " + page,
          images: [{ baseimageurl: "https://example.com/harvard.jpg" }],
        }],
      });
    }
    if (url.pathname === "/vna/objects/search") {
      return sendJson(res, {
        info: { pages: 2 },
        records: [{
          systemNumber: "O" + page,
          _primaryTitle: "V&A artwork " + page,
        }],
      });
    }
    if (url.pathname === "/harvard/object/1001") {
      return sendJson(res, {
        objectid: 1001,
        title: "Harvard artwork 1",
        primaryimageurl: "https://example.com/harvard.jpg",
      });
    }
    if (url.pathname === "/vna/object/O1") {
      return sendJson(res, {
        record: { systemNumber: "O1", titles: [{ title: "V&A artwork 1" }] },
        meta: { images: { _iiif_image: "https://example.com/iiif/O1/" } },
      });
    }
    return sendJson(res, {}, 404);
  });

  await new Promise((resolve) => museum.listen(0, "127.0.0.1", resolve));
  const museumBase = "http://127.0.0.1:" + museum.address().port;
  const port = 30000 + Math.floor(Math.random() * 10000);
  apiBase = "http://127.0.0.1:" + port;

  backend = spawn(process.execPath, ["server.js"], {
    env: {
      ...process.env,
      PORT: String(port),
      HARVARD_API_KEY: "testing-only",
      HARVARD_BASE_URL: museumBase + "/harvard",
      VNA_BASE_URL: museumBase + "/vna",
    },
    stdio: "pipe",
  });

  for (let i = 0; i < 50; i++) {
    if (backend.exitCode !== null) throw new Error("Backend process exited");
    try {
      if ((await fetch(apiBase + "/api/health")).ok) return;
    } catch {
      // Startup still in progress.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Backend did not start");
});

test.after(async () => {
  if (backend) backend.kill();
  if (museum) await new Promise((resolve) => museum.close(resolve));
});

test("search returns distinct artwork pages from both museums", async () => {
  const first = await fetch(apiBase + "/api/all-artworks?q=portrait&page=1");
  assert.equal(first.status, 200);
  const firstPage = await first.json();
  assert.deepEqual(firstPage.artworks.map((item) => item.objectid || item.systemNumber), [1001, "O1"]);
  assert.equal(firstPage.hasNextPage, true);

  const second = await fetch(apiBase + "/api/all-artworks?q=portrait&page=2");
  assert.equal(second.status, 200);
  const secondPage = await second.json();
  assert.deepEqual(secondPage.artworks.map((item) => item.objectid || item.systemNumber), [1002, "O2"]);
  assert.equal(secondPage.hasNextPage, false);
});

test("nested filters map to each museum's API parameters", async () => {
  await fetch(
    apiBase + "/api/all-artworks?q=flower" +
    "&classification%5BharvardId%5D=26&classification%5BvnaID%5D=THES48917" +
    "&technique%5BharvardId%5D=116&technique%5BvnaID%5D=AAT53241"
  );
  const harvard = requests.findLast((url) => url.pathname === "/harvard/object");
  const vna = requests.findLast((url) => url.pathname === "/vna/objects/search");
  assert.equal(harvard.searchParams.get("classification"), "26");
  assert.equal(harvard.searchParams.get("technique"), "116");
  assert.equal(vna.searchParams.get("id_category"), "THES48917");
  assert.equal(vna.searchParams.get("id_technique"), "AAT53241");
});

test("detail responses preserve artwork IDs and valid image URLs", async () => {
  const harvard = await fetch(apiBase + "/api/artwork/1001");
  assert.equal(harvard.status, 200);
  assert.equal((await harvard.json()).id, 1001);

  const vna = await fetch(apiBase + "/api/artwork/O1");
  assert.equal(vna.status, 200);
  const artwork = await vna.json();
  assert.equal(artwork.id, "O1");
  assert.equal(artwork.image, "https://example.com/iiif/O1/full/full/0/default.jpg");
});
