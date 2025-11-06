// Simple local JSON database HTTP server
// Accessible to devices on the same LAN (binds to 0.0.0.0)
// Endpoints:
//   - GET  /data/:file         -> read ./database/<file>.json
//   - POST /data/:file         -> write ./database/<file>.json
//   - GET  /dashboard          -> read dashboard.json
//   - GET  /notifications      -> read notifications.json
//   - POST /settings           -> write settings.json
//   - POST /feeding/schedule   -> write feeding.json
//   - POST /actions            -> log action and update dashboard.json

const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

const dbFolder = path.join(__dirname, "database");
if (!fs.existsSync(dbFolder)) fs.mkdirSync(dbFolder, { recursive: true });

const readJson = (name, fallback) => {
  const filePath = path.join(dbFolder, name + (name.endsWith('.json') ? '' : '.json'));
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const data = fs.readFileSync(filePath, "utf8");
    return JSON.parse(data);
  } catch (e) {
    console.error("readJson error for", name, e);
    return fallback;
  }
};

const writeJson = (name, obj) => {
  const filePath = path.join(dbFolder, name + (name.endsWith('.json') ? '' : '.json'));
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2));
};

// Generic file endpoints
app.get("/data/:file", (req, res) => {
  const out = readJson(req.params.file, null);
  if (out == null) return res.status(404).send("Not found");
  res.json(out);
});

app.post("/data/:file", (req, res) => {
  writeJson(req.params.file, req.body ?? {});
  res.send("Saved");
});

// App-specific endpoints
app.get("/dashboard", (req, res) => {
  const dashboard = readJson("dashboard", {});
  res.json(dashboard);
});

app.get("/notifications", (req, res) => {
  const items = readJson("notifications", []);
  res.json(items);
});

app.post("/settings", (req, res) => {
  const current = readJson("settings", {});
  const next = { ...current, ...(req.body || {}) };
  writeJson("settings", next);
  res.json({ ok: true });
});

app.post("/feeding/schedule", (req, res) => {
  const { weight, meal1Time, meal2Time } = req.body || {};
  const next = { weight, meal1Time, meal2Time };
  writeJson("feeding", next);

  // Also mirror into dashboard if useful
  const dash = readJson("dashboard", {});
  const mirrored = {
    ...dash,
    petWeight: weight ?? dash.petWeight,
    feedingTimes: [meal1Time, meal2Time].filter(Boolean).length === 2 ? [meal1Time, meal2Time] : dash.feedingTimes,
  };
  writeJson("dashboard", mirrored);

  res.json({ ok: true });
});

app.post("/actions", (req, res) => {
  const { action } = req.body || {};
  const dash = readJson("dashboard", {});

  if (action === "toggle_light") {
    const current = Boolean(dash.lightOn ?? dash?.deviceStatus?.lightOn);
    dash.lightOn = !current;
    dash.deviceStatus = { ...(dash.deviceStatus || {}), lightOn: dash.lightOn };
  } else if (action === "dispense_food") {
    dash.lastMeal = Number(dash.lastMeal || 0) + 20; // +20g as an example
  } else if (action === "reset_food_amount") {
    dash.lastMeal = 0;
  } else if (action === "refill_water") {
    dash.waterLevel = "100%";
  }

  writeJson("dashboard", dash);

  const history = readJson("actions", []);
  history.push({ ts: new Date().toISOString(), action });
  writeJson("actions", history);

  res.json({ ok: true, dashboard: dash });
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0"; // allow LAN access
app.listen(PORT, HOST, () => console.log(`Local DB server running at http://${HOST}:${PORT}`));
