require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const PORT = process.env.PORT || 4157;
const app = express();
app.use(cors());
app.use(express.json());
app.get("/", (req, res) => {
  res.send("Welcome to the Exhibition Curation Platform API! 👑🚀");
});

// Treat API query parameters as untrusted input. Axios sends nested filters using
// bracket notation, while direct clients may send JSON strings.
const parseMuseumFilter = (value) => {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
};

const isLaterPage = (response, page, requestedSize) => {
  const info = response?.data?.info;
  if (typeof info?.pages === "number") return page < info.pages;
  if (typeof info?.next === "string" && info.next) return true;
  const records = response?.data?.records;
  return Array.isArray(records) && records.length === requestedSize;
};

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/all-artworks", async (req, res) => {
  const { q, classification, technique, sortOpt, sortOrder } = req.query;
  const search = typeof q === "string" ? q.trim() : "";
  const pageValue = req.query.page ?? "1";
  const limitValue = req.query.minResults ?? "20";
  const page = Number(pageValue);
  const limit = Number(limitValue);

  if (!search || search.length > 150) {
    return res.status(400).json({ error: "Enter a search term of up to 150 characters." });
  }
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) {
    return res.status(400).json({ error: "Page must be a positive integer up to 10000." });
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 40) {
    return res.status(400).json({ error: "minResults must be between 1 and 40." });
  }
  if (sortOrder && !["asc", "desc"].includes(sortOrder)) {
    return res.status(400).json({ error: "Invalid sort order." });
  }

  const classificationFilter = parseMuseumFilter(classification);
  const techniqueFilter = parseMuseumFilter(technique);
  const sortFilter = parseMuseumFilter(sortOpt);
  const perMuseum = Math.min(50, Math.max(10, Math.ceil(limit / 2)));

  const harvardParams = {
    q: search,
    page,
    size: perMuseum,
    sort: sortFilter.harvard || "accessionyear",
    sortorder: sortOrder || "asc",
    apikey: process.env.HARVARD_API_KEY,
  };
  if (classificationFilter.harvardId) harvardParams.classification = classificationFilter.harvardId;
  if (techniqueFilter.harvardId) harvardParams.technique = techniqueFilter.harvardId;

  const vnaParams = {
    q: search,
    page,
    page_size: perMuseum,
    images_exist: true,
    order_sort: sortOrder || "asc",
  };
  if (classificationFilter.vnaID) vnaParams.id_category = classificationFilter.vnaID;
  if (techniqueFilter.vnaID) vnaParams.id_technique = techniqueFilter.vnaID;
  if (sortFilter.vna) vnaParams.order_by = sortFilter.vna;

  const requests = [
    process.env.HARVARD_API_KEY
      ? axios.get((process.env.HARVARD_BASE_URL || "https://api.harvardartmuseums.org") + "/object", {
          params: harvardParams,
          timeout: 10000,
        })
      : Promise.reject(new Error("Harvard API key not configured")),
    axios.get((process.env.VNA_BASE_URL || "https://api.vam.ac.uk/v2") + "/objects/search", {
      params: vnaParams,
      timeout: 10000,
    }),
  ];
  const [harvardResult, vnaResult] = await Promise.allSettled(requests);

  if (harvardResult.status === "rejected" && vnaResult.status === "rejected") {
    console.error("Museum searches unavailable", harvardResult.reason?.message, vnaResult.reason?.message);
    return res.status(503).json({ error: "Museum search is temporarily unavailable. Please try again." });
  }

  const harvardResponse = harvardResult.status === "fulfilled" ? harvardResult.value : null;
  const vnaResponse = vnaResult.status === "fulfilled" ? vnaResult.value : null;
  const harvardRecords = (harvardResponse?.data?.records || []).filter(
    (art) => Array.isArray(art.images) && art.images.length > 0
  );
  const vnaRecords = Array.isArray(vnaResponse?.data?.records) ? vnaResponse.data.records : [];

  // One remote page per source prevents duplicate/omitted records between client pages.
  // Preserve the existing raw museum record shape expected by the frontend.
  const artworks = [...harvardRecords, ...vnaRecords].slice(0, limit);
  const hasNextPage =
    isLaterPage(harvardResponse, page, perMuseum) ||
    isLaterPage(vnaResponse, page, perMuseum);

  return res.json({ artworks, hasNextPage });
});

app.get("/api/artwork/:id", async (req, res) => {
  const { id } = req.params;
  if (!/^[a-zA-Z0-9_-]{1,50}$/.test(id)) {
    return res.status(400).json({ error: "Invalid artwork ID." });
  }
  try {
    let artworkDetails = null;

    if (id.startsWith("O") || id.startsWith("o")) {
      const response = await axios
        .get(`${process.env.VNA_BASE_URL}/object/${id}`)
        .catch((error) => {
          if (error.response) {
            if (error.response.status === 401) {
              throw {
                status: 401,
                message: "Unauthorized: Invalid V&A API key",
              };
            }
            if (error.response.status === 404) {
              return { data: {} };
            }
          }
          throw error;
        });
      if (!response.data.record) {
        return res.status(404).json({ error: "Artwork not found." });
      }
      const { data } = response;
      const record = data.record;
      const meta = data.meta;
      artworkDetails = {
        id: record.systemNumber,
        image:
          meta?.images?._iiif_image
            ? meta.images._iiif_image.replace(/\/$/, "") + "/full/full/0/default.jpg"
            : "",
        title: record.titles?.[0]?.title || "No Title Available",
        artist: record.artistMakerPerson?.[0]?.name?.text || "",
        date: record.productionDates?.[0]?.date?.text || "Unknown",
        medium: record.materialsAndTechniques || "Not specified",
        dimensions: record.dimensions
          ? record.dimensions
              .map(
                (dim) =>
                  `${dim.dimension}: ${dim.value} ${dim.unit}${
                    dim.qualifier ? ` (${dim.qualifier})` : ""
                  }`
              )
              .join(", ")
          : "Not provided",
        description: record.summaryDescription || "No description available.",
        provenance: record.objectHistory || "Not available",
        location:
          record.galleryLocations?.[0]?.current?.text || "No specific location",
        creditLine: record.creditLine || "No credit line",
      };
    } else {
      const response = await axios
        .get(`${process.env.HARVARD_BASE_URL}/object/${id}`, {
          params: { apikey: process.env.HARVARD_API_KEY },
        })
        .catch((error) => {
          if (error.response) {
            if (error.response.status === 401) {
              throw {
                status: 401,
                message: "Unauthorized: Invalid Harvard API key",
              };
            }
            if (error.response.status === 404) {
              return { data: {} };
            }
          }
          throw error;
        });
      if (!response.data.title && !response.data.objectid) {
        return res.status(404).json({ error: "Artwork not found." });
      }
      const { data } = response;
      artworkDetails = {
        id: data.objectid || data.id,
        image:
          data.primaryimageurl || "",
        title: data.title || data.titles?.[0]?.title || "No Title Available",
        artist: data.people?.map((person) => person.name).filter(Boolean).join(", ") || "",
        date: data.dated || "Unknown",
        medium: data.medium || "Not specified",
        dimensions: data.dimensions || "Not provided",
        description: data.description || "No description available.",
        provenance: data.provenance || "Not available",
        location:
          (data.gallery && data.gallery.name) ||
          data.places?.[0]?.displayname ||
          "No specific location",
        creditLine: data.creditline || "No credit line",
      };
    }

    res.json(artworkDetails);
  } catch (error) {
    if (error.status) {
      res.status(error.status).json({ error: error.message });
    } else {
      res
        .status(500)
        .json({ error: error.message || "Failed to fetch artwork details" });
    }
  }
});

app.listen(PORT, () => {
  console.log("listening on port " + PORT);
});
