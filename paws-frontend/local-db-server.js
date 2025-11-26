const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const fsPromises = require("fs/promises");
const axios = require("axios");

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(cors());

const ENV_CURRENT_KEY = "environment-current";
const ENV_HISTORY_FILE = "environment-history";
const ENV_CHART_FILE = "environment";
const HISTORY_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours
const MIN_RECORD_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes per point
const MAX_HISTORY_POINTS = 64;
const METRIC_KEYS = ["temperature", "humidity", "co2", "voc", "methanal", "waterLevel"];

const WATER_EVENTS_FILE = "water-events";
const WATER_EVENT_WINDOW_MS = 48 * 60 * 60 * 1000; // 2 days
const WATER_DROP_THRESHOLD = 5; // percentage points
const MAX_WATER_EVENTS = 200;
const WATER_TOLERANCE_MINUTES = 15;
const WATER_LOW_NOTIFICATION = "Water level sensor reports LOW. Please refill the reservoir.";

const FEEDING_HISTORY_FILE = "feeding-history";
const FEEDING_HISTORY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_FEEDING_EVENTS = 400;
const FOOD_EXPECTED_FALLBACK = 200;

const MOTION_EVENTS_FILE = "motion-events";
const BARK_EVENTS_FILE = "bark-events";
const FEEDER_EVENTS_FILE = "feeder-events";
const ACTIVITY_HISTORY_FILE = "activity-history";
const EVENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_EVENT_LOG = 400;
const MOTION_DISTANCE_THRESHOLD_CM = 25;

const WEIGHT_HISTORY_FILE = "weight-history";
const WEIGHT_HISTORY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const WEIGHT_HISTORY_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_WEIGHT_HISTORY_POINTS = 500;
const WEIGHT_MIN_CHANGE = 0.05;

const AUTO_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const AUTO_CLEANUP_MAX_AGE_MS = 31 * 24 * 60 * 60 * 1000; // 31 days

const ANALYTICS_FILE = "analysis";
const NOTIFICATIONS_FILE = "notifications";
const NOTIFICATION_LIMIT = 50;
const NOTIFICATION_SUPPRESS_MS = 6 * 60 * 60 * 1000; // 6 hours

let lastWaterLevelReading;
let lastWaterLevelState;
let lastMotionLightState;
let lastBarkAlertState;
let lastAirQualityAlertState;
let lastPetSleepingState;
let lastFeedingState;

const configFolder = path.resolve(__dirname, "..", "config");
const secretsPath = path.join(configFolder, "secrets.json");
const secretsExamplePath = path.join(configFolder, "secrets.example.json");

const loadSecrets = () => {
  const fileToRead = fs.existsSync(secretsPath) ? secretsPath : secretsExamplePath;
  try {
    const raw = fs.readFileSync(fileToRead, "utf8");
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.warn(`Unable to read secrets file at ${fileToRead}. Using empty secrets.`, error);
    return {};
  }
};

const getLlmSecrets = () => {
  const secrets = loadSecrets();
  return secrets?.llm ?? {};
};

const dbFolder = path.join(__dirname, "database");
if (!fs.existsSync(dbFolder)) {
  fs.mkdirSync(dbFolder, { recursive: true });
}

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const fileLocks = new Map();
const queueFileOp = async (filePath, task) => {
  const previous = fileLocks.get(filePath) ?? Promise.resolve();
  let release = () => {};
  const next = previous.then(() => new Promise((resolve) => {
    release = resolve;
  }));
  fileLocks.set(filePath, next);
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (fileLocks.get(filePath) === next) {
      fileLocks.delete(filePath);
    }
  }
};

const resolveFilePath = (rawName) => {
  const trimmed = (rawName || "").trim();
  if (!trimmed) throw new HttpError(400, "File name is required");
  if (path.isAbsolute(trimmed)) throw new HttpError(400, "Invalid file path");
  const sanitised = trimmed.replace(/\\/g, "/");
  if (sanitised.includes("..")) throw new HttpError(400, "Invalid file path");
  const normalized = sanitised.endsWith(".json") ? sanitised : `${sanitised}.json`;
  const filePath = path.resolve(dbFolder, normalized);
  const relative = path.relative(dbFolder, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new HttpError(400, "Invalid file path");
  }
  return filePath;
};

const pruneUndefined = (value) => {
  if (Array.isArray(value) || value === null || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(Object.entries(value).filter(([, val]) => typeof val !== "undefined"));
};

const safelyReadJson = async (name, fallback) => {
  try {
    const payload = await readJsonFile(name);
    return typeof payload === "undefined" ? fallback : payload;
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      return fallback;
    }
    throw error;
  }
};

const normaliseFileKey = (raw = "") => raw.replace(/\.json$/i, "");
const isEnvironmentCurrentFile = (raw) => normaliseFileKey(raw) === ENV_CURRENT_KEY;

const sanitizeNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

const normalizeWaterState = (value) => {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (["low", "empty", "refill", "0", "off"].includes(normalized)) {
      return "low";
    }
    if (["high", "full", "ok", "normal", "1", "on"].includes(normalized)) {
      return "high";
    }
  }
  if (typeof value === "boolean") {
    return value ? "high" : "low";
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value <= 20) return "low";
    if (value >= 80) return "high";
  }
  return null;
};

const normalizeBoolean = (value) => {
  if (value === true) return true;
  if (value === false) return false;
  return undefined;
};

const toChartPoints = (history) => {
  const metrics = ["temperature", "co2", "voc", "methanal"];
  const formatLabel = (iso) => {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return iso;
    }
  };

  return metrics.reduce((acc, metric) => {
    acc[metric] = history
      .filter((entry) => typeof entry[metric] === "number")
      .map((entry) => ({ t: formatLabel(entry.ts), v: entry[metric] }));
    return acc;
  }, {});
};

const ensureArray = (value, fallback = []) => (Array.isArray(value) ? value : fallback);

const writeAnalysisSection = async (section, payload) => {
  await mergeJsonFile(ANALYTICS_FILE, { [section]: payload });
};

// Notification types that should trigger system-level push notifications
const PUSH_NOTIFICATION_TYPES = [
  "feeding_time",
  "feeding_complete", 
  "water_low",
  "abnormal_barking",
  "air_quality_alert",
  "system_alert",
];

const appendNotification = async (message, type = "alert", pushType = null) => {
  if (!message) return;
  let notifications = ensureArray(await safelyReadJson(NOTIFICATIONS_FILE, []));
  const existing = notifications.find((entry) => entry?.message === message);
  if (existing) {
    const lastTs = Date.parse(existing.time);
    if (Number.isFinite(lastTs) && Date.now() - lastTs < NOTIFICATION_SUPPRESS_MS) {
      return;
    }
    notifications = notifications.filter((entry) => entry?.message !== message);
  }

  // Add notification with push flag for important events
  const shouldPush = pushType && PUSH_NOTIFICATION_TYPES.includes(pushType);
  notifications.unshift({ 
    message, 
    type, 
    time: new Date().toISOString(),
    pushType: shouldPush ? pushType : undefined,
    pushed: false, // App will set this to true after sending push notification
  });
  notifications = notifications.slice(0, NOTIFICATION_LIMIT);
  await writeJsonFile(NOTIFICATIONS_FILE, notifications);
};

const recordEventWithWindow = async (file, event, windowMs = EVENT_WINDOW_MS, maxEntries = MAX_EVENT_LOG) => {
  if (!event || typeof event !== "object") {
    return [];
  }
  let events = ensureArray(await safelyReadJson(file, []));
  events.push(pruneUndefined({ ts: new Date().toISOString(), ...event }));
  const cutoff = Date.now() - windowMs;
  events = events
    .filter((entry) => {
      const ts = Date.parse(entry?.ts);
      return Number.isFinite(ts) && ts >= cutoff;
    })
    .slice(-maxEntries);
  await writeJsonFile(file, events);
  return events;
};

const recordWaterIntakeEvent = async (event = {}) => {
  const deltaValue = sanitizeNumber(event?.delta);
  const levelAfterValue = sanitizeNumber(event?.levelAfter);
  const state = typeof event?.state === "string" ? event.state.trim().toLowerCase() : undefined;
  if (!Number.isFinite(deltaValue) && !state) return;
  let events = ensureArray(await safelyReadJson(WATER_EVENTS_FILE, []));
  events.push(
    pruneUndefined({
      ts: new Date().toISOString(),
      delta: Number.isFinite(deltaValue) ? Number(deltaValue.toFixed(1)) : undefined,
      levelAfter: Number.isFinite(levelAfterValue) ? Number(levelAfterValue.toFixed(1)) : undefined,
      state,
    })
  );
  const cutoff = Date.now() - WATER_EVENT_WINDOW_MS;
  events = events
    .filter((event) => {
      const ts = Date.parse(event?.ts);
      return Number.isFinite(ts) && ts >= cutoff;
    })
    .slice(-MAX_WATER_EVENTS);
  await writeJsonFile(WATER_EVENTS_FILE, events);
  await runWaterAnalysis(events);
};

const groupMinutesWithinTolerance = (minutes) => {
  const grouped = [];
  const used = new Set();
  minutes.forEach((base, idx) => {
    if (used.has(idx)) return;
    const bucket = [base];
    used.add(idx);
    minutes.forEach((comparison, jdx) => {
      if (used.has(jdx)) return;
      if (Math.abs(comparison - base) <= WATER_TOLERANCE_MINUTES) {
        bucket.push(comparison);
        used.add(jdx);
      }
    });
    grouped.push(bucket);
  });
  return grouped;
};

const runWaterAnalysis = async (eventsInput) => {
  const events = ensureArray(eventsInput ?? (await safelyReadJson(WATER_EVENTS_FILE, [])));
  const minutes = events
    .map((event) => {
      const ts = Date.parse(event?.ts);
      if (!Number.isFinite(ts)) return null;
      const date = new Date(ts);
      return date.getHours() * 60 + date.getMinutes();
    })
    .filter((val) => typeof val === "number");

  const result = {
    updatedAt: new Date().toISOString(),
    totalEvents: minutes.length,
    toleranceMinutes: WATER_TOLERANCE_MINUTES,
    mostFrequentTime: null,
    status: minutes.length ? "ok" : "insufficient_data",
    warning: null,
  };

  if (minutes.length) {
    const grouped = groupMinutesWithinTolerance(minutes).sort((a, b) => b.length - a.length);
    const topGroup = grouped[0];
    if (topGroup?.length) {
      const avgMinutes = Math.round(topGroup.reduce((sum, value) => sum + value, 0) / topGroup.length);
      const hours = String(Math.floor(avgMinutes / 60)).padStart(2, "0");
      const mins = String(avgMinutes % 60).padStart(2, "0");
      result.mostFrequentTime = `${hours}:${mins}`;
    }

    const lastTs = events[events.length - 1]?.ts;
    if (!lastTs || Date.now() - Date.parse(lastTs) > 12 * 60 * 60 * 1000) {
      result.warning = "Water intake has not been detected in over 12 hours.";
      result.status = "warning";
      await appendNotification(result.warning, "warning");
    }
  }

  await writeAnalysisSection("water", result);
};

const monitorWaterLevel = async (snapshot) => {
  if (!snapshot || typeof snapshot !== "object") return;

  const numericLevel = sanitizeNumber(snapshot?.waterLevel);
  if (typeof numericLevel === "number") {
    if (typeof lastWaterLevelReading === "number") {
      const delta = lastWaterLevelReading - numericLevel;
      if (delta >= WATER_DROP_THRESHOLD) {
        await recordWaterIntakeEvent({ delta, levelAfter: numericLevel });
      }
    }
    lastWaterLevelReading = numericLevel;
  }

  const state = normalizeWaterState(snapshot?.waterLevelState ?? snapshot?.waterLevel);
  if (!state) return;

  if (state === "low") {
    await appendNotification(WATER_LOW_NOTIFICATION, "warning", "water_low");
  }

  if (state === "low" && lastWaterLevelState !== "low") {
    await recordWaterIntakeEvent({ state });
  }

  lastWaterLevelState = state;
};

const handleMotionSnapshot = async (snapshot = {}) => {
  const lightOn = snapshot?.motionLightOn === true;
  const distance = sanitizeNumber(snapshot?.motionDistanceCm);
  if (lightOn || (typeof distance === "number" && distance <= MOTION_DISTANCE_THRESHOLD_CM)) {
    await recordEventWithWindow(MOTION_EVENTS_FILE, { lightOn, distance }, EVENT_WINDOW_MS, 200);
  }
  if (lightOn && !lastMotionLightState) {
    await appendNotification("Motion detected near the habitat entrance.", "info");
  }
  lastMotionLightState = lightOn;
};

const handleBarkSnapshot = async (snapshot = {}) => {
  const barkAlert = snapshot?.barkAlertActive === true;
  const barkCount = sanitizeNumber(snapshot?.barkCount);
  if (Number.isFinite(barkCount) && barkCount > 0) {
    await recordEventWithWindow(BARK_EVENTS_FILE, { barkCount, alert: barkAlert });
  }
  if (barkAlert && !lastBarkAlertState) {
    await appendNotification("Repeated barking detected. Please check on your pet.", "warning", "abnormal_barking");
  }
  lastBarkAlertState = barkAlert;
};

const deriveFeederState = (snapshot = {}) => {
  if (typeof snapshot?.feedingStatus === "string") {
    return snapshot.feedingStatus.toLowerCase();
  }
  if (snapshot?.feedingInProgress === true) {
    return "feeding";
  }
  if (snapshot?.feedingInProgress === false && snapshot?.feederCurrentWeight > 0) {
    return "idle";
  }
  return undefined;
};

const handleFeederSnapshot = async (snapshot = {}) => {
  const feederState = deriveFeederState(snapshot);
  const currentWeight = sanitizeNumber(snapshot?.feederCurrentWeight);
  const targetWeight = sanitizeNumber(snapshot?.feederTargetWeight);
  if (feederState || typeof currentWeight === "number" || typeof targetWeight === "number") {
    await recordEventWithWindow(
      FEEDER_EVENTS_FILE,
      { state: feederState, currentWeight, targetWeight },
      EVENT_WINDOW_MS,
      MAX_FEEDING_EVENTS
    );
    await mergeJsonFile(
      "dashboard",
      pruneUndefined({
        feederStatus: feederState,
        feederCurrentWeight: currentWeight,
        feederTargetWeight: targetWeight,
      })
    );
  }
  if (feederState === "feeding" && lastFeedingState !== "feeding") {
    await appendNotification("Hardware feeder started dispensing food.", "info");
  }
  if (feederState === "idle" && lastFeedingState === "feeding") {
    await appendNotification("Hardware feeder finished dispensing food.", "success", "feeding_complete");
  }
  lastFeedingState = feederState ?? lastFeedingState;
};

const handleActivitySnapshot = async (snapshot = {}) => {
  const sleeping = snapshot?.petSleeping === true;
  const activityWeight = sanitizeNumber(snapshot?.activityWeight ?? snapshot?.petWeight);
  if (typeof activityWeight === "number") {
    await recordEventWithWindow(ACTIVITY_HISTORY_FILE, { sleeping, weight: activityWeight });
  }
  if (typeof sleeping === "boolean") {
    await mergeJsonFile("dashboard", { petSleeping: sleeping });
    if (typeof lastPetSleepingState === "boolean" && sleeping !== lastPetSleepingState) {
      await appendNotification(
        sleeping ? "Pet is sleeping based on the activity scale." : "Pet is active again.",
        "info"
      );
    }
    lastPetSleepingState = sleeping;
  }
};

const handleAirQualitySnapshot = async (snapshot = {}) => {
  const aqi = typeof snapshot?.aqi === "string" ? snapshot.aqi : undefined;
  const fanOn = snapshot?.fanOn === true;
  const motionLight = normalizeBoolean(snapshot?.motionLightOn);
  const barkAlert = normalizeBoolean(snapshot?.barkAlertActive);
  await mergeJsonFile(
    "dashboard",
    pruneUndefined({
      aqi,
      fanOn,
      motionLightOn: motionLight,
      motionDistanceCm: sanitizeNumber(snapshot?.motionDistanceCm),
      barkAlertActive: barkAlert,
    })
  );

  const airQualityAlert = snapshot?.airQualityAlert === true || (typeof aqi === "string" && aqi.toLowerCase() === "poor");
  if (airQualityAlert && !lastAirQualityAlertState) {
    await appendNotification("Air quality dropped to poor levels. Ventilation engaged.", "warning", "air_quality_alert");
  }
  lastAirQualityAlertState = airQualityAlert;
};

const recordWeightHistory = async (weightKg) => {
  if (!(typeof weightKg === "number" && Number.isFinite(weightKg) && weightKg > 0)) {
    return;
  }

  let history = ensureArray(await safelyReadJson(WEIGHT_HISTORY_FILE, []));
  const now = Date.now();
  const lastEntry = history[history.length - 1];
  const lastTs = lastEntry?.ts ? Date.parse(lastEntry.ts) : NaN;
  const lastWeight = sanitizeNumber(lastEntry?.weight);

  if (
    Number.isFinite(lastTs) &&
    now - lastTs < WEIGHT_HISTORY_INTERVAL_MS &&
    typeof lastWeight === "number" &&
    Math.abs(lastWeight - weightKg) < WEIGHT_MIN_CHANGE
  ) {
    return;
  }

  history.push({ ts: new Date(now).toISOString(), weight: Number(weightKg.toFixed(2)) });
  const cutoff = now - WEIGHT_HISTORY_WINDOW_MS;
  history = history
    .filter((entry) => {
      const ts = Date.parse(entry?.ts);
      return Number.isFinite(ts) && ts >= cutoff;
    })
    .slice(-MAX_WEIGHT_HISTORY_POINTS);

  await writeJsonFile(WEIGHT_HISTORY_FILE, history);
};

const maybeRecordWeightSnapshot = async (snapshot) => {
  if (!snapshot || typeof snapshot !== "object") return;
  const rawWeight = snapshot.petWeight ?? snapshot.weight ?? snapshot.currentWeight;
  const weight = sanitizeNumber(rawWeight);
  if (typeof weight !== "number") return;

  await recordWeightHistory(weight);
  await mergeJsonFile("dashboard", { petWeight: Number(weight.toFixed(2)) });
};

const recordFeedingEvent = async (amount) => {
  if (!(Number.isFinite(amount) && amount > 0)) {
    return;
  }
  let history = ensureArray(await safelyReadJson(FEEDING_HISTORY_FILE, []));
  history.push({ ts: new Date().toISOString(), amount });
  const cutoff = Date.now() - FEEDING_HISTORY_WINDOW_MS;
  history = history
    .filter((entry) => {
      const ts = Date.parse(entry?.ts);
      return Number.isFinite(ts) && ts >= cutoff;
    })
    .slice(-MAX_FEEDING_EVENTS);
  await writeJsonFile(FEEDING_HISTORY_FILE, history);
  await runFoodAnalysis(history);
};

const runFoodAnalysis = async (historyInput) => {
  const history = ensureArray(historyInput ?? (await safelyReadJson(FEEDING_HISTORY_FILE, [])));
  const groups = history.reduce((acc, entry) => {
    const ts = Date.parse(entry?.ts);
    const amount = sanitizeNumber(entry?.amount);
    if (!Number.isFinite(ts) || typeof amount !== "number") {
      return acc;
    }
    const key = new Date(ts).toISOString().slice(0, 10);
    acc[key] = acc[key] || [];
    acc[key].push(amount);
    return acc;
  }, {});

  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);

  const mean = (arr) => (arr?.length ? arr.reduce((sum, value) => sum + value, 0) / arr.length : 0);
  const todayMean = mean(groups[todayKey]);
  const yesterdayMean = mean(groups[yesterdayKey]);
  const comparePastData = yesterdayMean > 0 ? Number((todayMean / yesterdayMean - 1).toFixed(2)) : null;

  const feedingPlan = (await safelyReadJson("feeding", {})) || {};
  const plannedMeals = [feedingPlan.meal1Time, feedingPlan.meal2Time, feedingPlan.meal3Time]
    .filter(Boolean).length || 2;
  const expectedPerMeal = sanitizeNumber(feedingPlan.mealAmount) ?? FOOD_EXPECTED_FALLBACK;
  const expectedFoodConsumption = plannedMeals * expectedPerMeal;

  const todayTotalRaw = groups[todayKey]?.reduce((sum, value) => sum + value, 0) ?? 0;
  const todayTotal = Number(todayTotalRaw.toFixed(1));
  const foodWarning = todayTotal < expectedFoodConsumption * 0.6;

  const result = {
    updatedAt: new Date().toISOString(),
    comparePastData,
    foodWarning,
    todayAverage: Number(todayMean.toFixed(1)),
    yesterdayAverage: Number(yesterdayMean.toFixed(1)),
    expectedFoodConsumption,
    todayTotal,
  };

  if (foodWarning) {
    await appendNotification("Food intake is below the expected schedule. Please check the feeder.", "warning", "system_alert");
  }

  await writeAnalysisSection("food", result);
};

const maybeRecordEnvironmentSnapshot = async (fileName, snapshot) => {
  if (!isEnvironmentCurrentFile(fileName) || !snapshot || typeof snapshot !== "object") {
    return;
  }

  const entry = {
    ts: new Date().toISOString(),
  };
  let hasMetric = false;
  METRIC_KEYS.forEach((key) => {
    const numeric = sanitizeNumber(snapshot[key]);
    if (typeof numeric === "number") {
      entry[key] = numeric;
      if (["temperature", "co2", "voc", "methanal"].includes(key)) {
        hasMetric = true;
      }
    }
  });

  if (!hasMetric) {
    return;
  }

  let history = await safelyReadJson(ENV_HISTORY_FILE, []);
  if (!Array.isArray(history)) {
    history = [];
  }

  const nowTs = Date.now();
  const last = history[history.length - 1];
  const lastTs = last?.ts ? Date.parse(last.ts) : 0;
  if (last && nowTs - lastTs < MIN_RECORD_INTERVAL_MS) {
    history[history.length - 1] = { ...last, ...entry, ts: last.ts };
  } else {
    history.push(entry);
  }

  history = history.filter((item) => {
    if (!item?.ts) return false;
    const ts = Date.parse(item.ts);
    return Number.isFinite(ts) && nowTs - ts <= HISTORY_WINDOW_MS;
  });

  if (history.length > MAX_HISTORY_POINTS) {
    history = history.slice(history.length - MAX_HISTORY_POINTS);
  }

  await writeJsonFile(ENV_HISTORY_FILE, history);
  await writeJsonFile(ENV_CHART_FILE, toChartPoints(history));
  await monitorWaterLevel(snapshot);
  await maybeRecordWeightSnapshot(snapshot);
  await handleMotionSnapshot(snapshot);
  await handleBarkSnapshot(snapshot);
  await handleFeederSnapshot(snapshot);
  await handleActivitySnapshot(snapshot);
  await handleAirQualitySnapshot(snapshot);
};

const readJsonFile = async (name) => {
  const filePath = resolveFilePath(name);
  return queueFileOp(filePath, async () => {
    try {
      const contents = await fsPromises.readFile(filePath, "utf8");
      return contents.length ? JSON.parse(contents) : null;
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new HttpError(404, "File not found", { file: name });
      }
      if (error instanceof SyntaxError) {
        throw new HttpError(500, "Stored data is not valid JSON", { file: name });
      }
      throw error;
    }
  });
};

const writeJsonFile = async (name, payload) => {
  const filePath = resolveFilePath(name);
  return queueFileOp(filePath, async () => {
    try {
      await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
      const cleanPayload = pruneUndefined(payload);
      await fsPromises.writeFile(filePath, JSON.stringify(cleanPayload, null, 2), "utf8");
      return cleanPayload;
    } catch (error) {
      throw new HttpError(500, "Failed to write file", { file: name });
    }
  });
};

const mergeJsonFile = async (name, mutation) => {
  const filePath = resolveFilePath(name);
  return queueFileOp(filePath, async () => {
    let current = {};
    try {
      const raw = await fsPromises.readFile(filePath, "utf8");
      current = raw.length ? JSON.parse(raw) : {};
    } catch (error) {
      if (error.code !== "ENOENT") {
        if (error instanceof SyntaxError) {
          throw new HttpError(500, "Stored data is not valid JSON", { file: name });
        }
        throw error;
      }
    }

    const updates = pruneUndefined(mutation);
    const next = typeof current === "object" && current !== null
      ? pruneUndefined({ ...current, ...updates })
      : updates;

    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
    await fsPromises.writeFile(filePath, JSON.stringify(next, null, 2), "utf8");
    return next;
  });
};

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/files", asyncHandler(async (req, res) => {
  const entries = await fsPromises.readdir(dbFolder);
  const files = entries.filter((entry) => entry.endsWith(".json"));
  res.json({ files });
}));

app.get("/api/files/:file", asyncHandler(async (req, res) => {
  const payload = await readJsonFile(req.params.file);
  res.json(payload);
}));

app.post("/api/files/:file", asyncHandler(async (req, res) => {
  if (typeof req.body === "undefined") {
    throw new HttpError(400, "Request body is required");
  }
  const payload = await writeJsonFile(req.params.file, req.body);
  await maybeRecordEnvironmentSnapshot(req.params.file, payload);
  res.status(201).json({ message: "Saved", data: payload });
}));

app.put("/api/files/:file", asyncHandler(async (req, res) => {
  if (typeof req.body === "undefined") {
    throw new HttpError(400, "Request body is required");
  }
  const payload = await writeJsonFile(req.params.file, req.body);
  await maybeRecordEnvironmentSnapshot(req.params.file, payload);
  res.json({ message: "Replaced", data: payload });
}));

app.patch("/api/files/:file", asyncHandler(async (req, res) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    throw new HttpError(400, "Request body must be a JSON object");
  }
  // Add lastUpdated timestamp for environment-current (Arduino uploads)
  const bodyWithTimestamp = req.params.file === ENV_CURRENT_KEY
    ? { ...req.body, lastUpdated: new Date().toISOString() }
    : req.body;
  const payload = await mergeJsonFile(req.params.file, bodyWithTimestamp);
  await maybeRecordEnvironmentSnapshot(req.params.file, payload);
  res.json({ message: "Updated", data: payload });
}));

app.delete("/api/files/:file", asyncHandler(async (req, res) => {
  const filePath = resolveFilePath(req.params.file);
  await queueFileOp(filePath, async () => {
    try {
      await fsPromises.unlink(filePath);
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new HttpError(404, "File not found", { file: req.params.file });
      }
      throw error;
    }
  });
  res.status(204).send();
}));

app.get("/dashboard", asyncHandler(async (req, res) => {
  const [dashboard, envCurrent] = await Promise.all([
    readJsonFile("dashboard").catch((error) => {
      if (error.status === 404) return {};
      throw error;
    }),
    safelyReadJson(ENV_CURRENT_KEY, {}),
  ]);

  // Determine device status based on lastUpdated timestamp
  const lastUpdated = envCurrent?.lastUpdated;
  let deviceStatus = "Offline";
  if (lastUpdated) {
    const lastUpdateTime = new Date(lastUpdated).getTime();
    const now = Date.now();
    const secondsSinceUpdate = Math.floor((now - lastUpdateTime) / 1000);
    // Arduino uploads every 5 seconds; consider online if updated within 15 seconds
    if (secondsSinceUpdate <= 15) {
      deviceStatus = "Online";
    } else if (secondsSinceUpdate <= 60) {
      deviceStatus = `Last seen ${secondsSinceUpdate}s ago`;
    } else {
      const minutes = Math.floor(secondsSinceUpdate / 60);
      deviceStatus = `Offline (${minutes}m ago)`;
    }
  }

  // Merge environment data into dashboard response
  const merged = {
    ...dashboard,
    // Include environment readings if not already in dashboard
    temperature: dashboard?.temperature ?? envCurrent?.temperature,
    humidity: dashboard?.humidity ?? envCurrent?.humidity,
    aqi: dashboard?.aqi ?? envCurrent?.aqi,
    waterLevel: dashboard?.waterLevel ?? envCurrent?.waterLevel,
    waterLevelState: dashboard?.waterLevelState ?? envCurrent?.waterLevelState,
    deviceStatus,
    lastUpdated,
  };

  res.json(merged ?? {});
}));

app.get("/notifications", asyncHandler(async (req, res) => {
  const notifications = await readJsonFile("notifications").catch((error) => {
    if (error.status === 404) return [];
    throw error;
  });
  res.json(Array.isArray(notifications) ? notifications : []);
}));

// Mark notifications as pushed (after app sends local push notification)
app.post("/notifications/mark-pushed", asyncHandler(async (req, res) => {
  const { times } = req.body || {};
  if (!Array.isArray(times) || times.length === 0) {
    throw new HttpError(400, "Array of notification times is required");
  }
  
  let notifications = ensureArray(await safelyReadJson(NOTIFICATIONS_FILE, []));
  let updated = 0;
  
  notifications = notifications.map((n) => {
    if (times.includes(n.time) && !n.pushed) {
      updated++;
      return { ...n, pushed: true };
    }
    return n;
  });
  
  if (updated > 0) {
    await writeJsonFile(NOTIFICATIONS_FILE, notifications);
  }
  
  res.json({ message: `Marked ${updated} notifications as pushed` });
}));

app.post("/settings", asyncHandler(async (req, res) => {
  if (!req.body || typeof req.body !== "object") {
    throw new HttpError(400, "Settings payload must be an object");
  }
  const updated = await mergeJsonFile("settings", req.body);
  res.json({ message: "Settings updated", data: updated });
}));

app.post("/feeding/schedule", asyncHandler(async (req, res) => {
  const { weight, meal1Time, meal2Time, mealAmount } = req.body || {};
  if (!weight && !meal1Time && !meal2Time && !mealAmount) {
    throw new HttpError(400, "Schedule payload is required");
  }

  const weightNumber = typeof weight === "string" ? Number(weight) : weight;
  const normalizedWeight = Number.isFinite(weightNumber) ? weightNumber : undefined;

  let sanitizedMealAmount;
  if (typeof mealAmount === "number" && Number.isFinite(mealAmount)) {
    sanitizedMealAmount = mealAmount;
  } else if (typeof mealAmount === "string" && mealAmount.trim()) {
    const parsed = Number(mealAmount.trim());
    sanitizedMealAmount = Number.isFinite(parsed) ? parsed : mealAmount.trim();
  }

  const feeding = await writeJsonFile("feeding", {
    weight: normalizedWeight,
    meal1Time,
    meal2Time,
    mealAmount: sanitizedMealAmount,
  });

  await mergeJsonFile("dashboard", {
    petWeight: normalizedWeight,
    feedingTimes: [meal1Time, meal2Time].filter(Boolean).length
      ? [meal1Time, meal2Time].filter(Boolean)
      : undefined,
    mealAmount: sanitizedMealAmount,
  });

  res.json({ message: "Feeding schedule saved", data: feeding });
}));

app.post("/actions", asyncHandler(async (req, res) => {
  const { action } = req.body || {};
  if (!action) throw new HttpError(400, "Action is required");

  const dashboard = await readJsonFile("dashboard").catch((error) => {
    if (error.status === 404) return {};
    throw error;
  });

  const nextDashboard = { ...dashboard };
  let feedingAmountToRecord = 0;

  switch (action) {
    case "toggle_light": {
      const current = Boolean(nextDashboard.lightOn ?? nextDashboard?.deviceStatus?.lightOn);
      nextDashboard.lightOn = !current;
      nextDashboard.deviceStatus = { ...(nextDashboard.deviceStatus || {}), lightOn: nextDashboard.lightOn };
      break;
    }
    case "dispense_food": {
      const dispensedAmount = 20;
      nextDashboard.lastMeal = Number(nextDashboard.lastMeal || 0) + dispensedAmount;
      nextDashboard.lastMealTime = new Date().toISOString();
      feedingAmountToRecord = dispensedAmount;
      break;
    }
    case "reset_food_amount": {
      nextDashboard.lastMeal = 0;
      nextDashboard.lastMealTime = null;
      break;
    }
    case "refill_water": {
      nextDashboard.waterLevel = "100%";
      break;
    }
    default:
      throw new HttpError(400, "Unsupported action", { action });
  }

  await writeJsonFile("dashboard", nextDashboard);
  if (feedingAmountToRecord > 0) {
    await recordFeedingEvent(feedingAmountToRecord);
  }

  const history = await readJsonFile("actions").catch((error) => {
    if (error.status === 404) return [];
    throw error;
  });

  history.push({ ts: new Date().toISOString(), action });
  await writeJsonFile("actions", history);

  res.json({ message: "Action processed", data: nextDashboard });
}));

app.post("/llm/chat", asyncHandler(async (req, res) => {
  const { messages, model, temperature } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new HttpError(400, "messages array is required");
  }

  const llmSecrets = getLlmSecrets();
  const host = process.env.LLM_HOST || llmSecrets.host;
  const llmModel = model || llmSecrets.model;
  const llmTemperature =
    typeof temperature === "number" && Number.isFinite(temperature)
      ? temperature
      : llmSecrets.temperature;

  if (!host || !llmModel || typeof llmTemperature !== "number") {
    throw new HttpError(500, "LLM configuration is incomplete");
  }

  const targetBase = host.endsWith("/") ? host.slice(0, -1) : host;
  const payload = {
    model: llmModel,
    temperature: llmTemperature,
    max_tokens: -1,
    stream: false,
    messages,
  };

  try {
    const response = await axios.post(`${targetBase}/v1/chat/completions`, payload, {
      timeout: 30000,
    });
    res.json(response.data);
  } catch (error) {
    if (error?.response) {
      throw new HttpError(error.response.status || 502, "LLM request failed", {
        status: error.response.status,
        data: error.response.data,
      });
    }
    throw new HttpError(502, error?.message || "Unable to reach LLM host");
  }
}));

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON payload" });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }

  console.error("Unhandled error", err);
  res.status(500).json({ error: "Internal server error" });
});

const bootstrapAnalytics = async () => {
  try {
    await runWaterAnalysis();
    await runFoodAnalysis();
  } catch (error) {
    console.error("Failed to bootstrap analytics", error);
  }
};

// Auto-cleanup: remove records older than 31 days from all database files
// Files with array data (event logs, history)
const AUTO_CLEANUP_ARRAY_FILES = [
  WATER_EVENTS_FILE,        // water-events
  FEEDING_HISTORY_FILE,     // feeding-history
  MOTION_EVENTS_FILE,       // motion-events
  BARK_EVENTS_FILE,         // bark-events
  FEEDER_EVENTS_FILE,       // feeder-events
  ACTIVITY_HISTORY_FILE,    // activity-history
  WEIGHT_HISTORY_FILE,      // weight-history
  ENV_HISTORY_FILE,         // environment-history
  NOTIFICATIONS_FILE,       // notifications
];

// Files with object data that may contain timestamped entries
const AUTO_CLEANUP_OBJECT_FILES = [
  "actions",
  ANALYTICS_FILE,           // analysis
  "dashboard",
  ENV_CURRENT_KEY,          // environment-current
];
// Note: settings.json and feeding.json are excluded (user preferences/config)
// Note: environment.json (ENV_CHART_FILE) is handled separately as it has nested arrays

const runAutoCleanup = async () => {
  const cutoff = Date.now() - AUTO_CLEANUP_MAX_AGE_MS;
  let totalRemoved = 0;

  // Clean array-based files (event logs, history)
  for (const file of AUTO_CLEANUP_ARRAY_FILES) {
    try {
      const data = await safelyReadJson(file, []);
      if (!Array.isArray(data)) continue;

      const before = data.length;
      const filtered = data.filter((entry) => {
        // Try 'ts' first (most event files), then 'time' (notifications)
        const timestamp = entry?.ts || entry?.time;
        if (!timestamp) return true; // Keep entries without timestamp
        const ts = Date.parse(timestamp);
        return Number.isFinite(ts) && ts >= cutoff;
      });

      if (filtered.length < before) {
        await writeJsonFile(file, filtered);
        totalRemoved += before - filtered.length;
        console.log(`Auto-cleanup: removed ${before - filtered.length} old records from ${file}`);
      }
    } catch (error) {
      console.error(`Auto-cleanup error for ${file}:`, error.message);
    }
  }

  // Clean object-based files (check for timestamped properties)
  for (const file of AUTO_CLEANUP_OBJECT_FILES) {
    try {
      const data = await safelyReadJson(file, {});
      if (!data || typeof data !== "object" || Array.isArray(data)) continue;

      // Check if the object has a timestamp that's too old
      const timestamp = data?.ts || data?.time || data?.timestamp || data?.updatedAt;
      if (timestamp) {
        const ts = Date.parse(timestamp);
        if (Number.isFinite(ts) && ts < cutoff) {
          await writeJsonFile(file, {});
          totalRemoved++;
          console.log(`Auto-cleanup: cleared stale data from ${file}`);
        }
      }
    } catch (error) {
      console.error(`Auto-cleanup error for ${file}:`, error.message);
    }
  }

  // Also cleanup environment chart data (object with metric arrays)
  try {
    const chartData = await safelyReadJson(ENV_CHART_FILE, {});
    if (chartData && typeof chartData === "object") {
      let chartModified = false;
      for (const metric of Object.keys(chartData)) {
        if (!Array.isArray(chartData[metric])) continue;
        const before = chartData[metric].length;
        chartData[metric] = chartData[metric].filter((entry) => {
          const timestamp = entry?.ts || entry?.t;
          if (!timestamp) return true;
          const ts = Date.parse(timestamp);
          return Number.isFinite(ts) && ts >= cutoff;
        });
        if (chartData[metric].length < before) {
          chartModified = true;
          totalRemoved += before - chartData[metric].length;
        }
      }
      if (chartModified) {
        await writeJsonFile(ENV_CHART_FILE, chartData);
        console.log(`Auto-cleanup: cleaned old environment chart data`);
      }
    }
  } catch (error) {
    console.error("Auto-cleanup error for environment chart:", error.message);
  }

  if (totalRemoved > 0) {
    console.log(`Auto-cleanup complete: removed ${totalRemoved} total records older than 31 days`);
  }
};

// Run cleanup on startup and then every hour
const startAutoCleanup = () => {
  runAutoCleanup().catch((err) => console.error("Initial auto-cleanup failed:", err));
  setInterval(() => {
    runAutoCleanup().catch((err) => console.error("Auto-cleanup failed:", err));
  }, AUTO_CLEANUP_INTERVAL_MS);
};

bootstrapAnalytics();
startAutoCleanup();

const args = process.argv.slice(2);
const portFromArg = args.find((arg) => arg.startsWith("--port="));
const hostFromArg = args.find((arg) => arg.startsWith("--host="));
const port = Number(portFromArg?.split("=")[1]) || Number(process.env.PORT) || 4100;
const host = hostFromArg?.split("=")[1] || process.env.HOST || "0.0.0.0";

app.listen(port, host, () => {
  console.log(`Local DB server running at http://${host}:${port}`);
});
