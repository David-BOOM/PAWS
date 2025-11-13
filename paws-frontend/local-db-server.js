const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const fsPromises = require("fs/promises");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cors());

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
  res.status(201).json({ message: "Saved", data: payload });
}));

app.put("/api/files/:file", asyncHandler(async (req, res) => {
  if (typeof req.body === "undefined") {
    throw new HttpError(400, "Request body is required");
  }
  const payload = await writeJsonFile(req.params.file, req.body);
  res.json({ message: "Replaced", data: payload });
}));

app.patch("/api/files/:file", asyncHandler(async (req, res) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    throw new HttpError(400, "Request body must be a JSON object");
  }
  const payload = await mergeJsonFile(req.params.file, req.body);
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
  const dashboard = await readJsonFile("dashboard").catch((error) => {
    if (error.status === 404) return {};
    throw error;
  });
  res.json(dashboard ?? {});
}));

app.get("/notifications", asyncHandler(async (req, res) => {
  const notifications = await readJsonFile("notifications").catch((error) => {
    if (error.status === 404) return [];
    throw error;
  });
  res.json(Array.isArray(notifications) ? notifications : []);
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

  switch (action) {
    case "toggle_light": {
      const current = Boolean(nextDashboard.lightOn ?? nextDashboard?.deviceStatus?.lightOn);
      nextDashboard.lightOn = !current;
      nextDashboard.deviceStatus = { ...(nextDashboard.deviceStatus || {}), lightOn: nextDashboard.lightOn };
      break;
    }
    case "dispense_food": {
      nextDashboard.lastMeal = Number(nextDashboard.lastMeal || 0) + 20;
      break;
    }
    case "reset_food_amount": {
      nextDashboard.lastMeal = 0;
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

  const history = await readJsonFile("actions").catch((error) => {
    if (error.status === 404) return [];
    throw error;
  });

  history.push({ ts: new Date().toISOString(), action });
  await writeJsonFile("actions", history);

  res.json({ message: "Action processed", data: nextDashboard });
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

const args = process.argv.slice(2);
const portFromArg = args.find((arg) => arg.startsWith("--port="));
const hostFromArg = args.find((arg) => arg.startsWith("--host="));
const port = Number(portFromArg?.split("=")[1]) || Number(process.env.PORT) || 4100;
const host = hostFromArg?.split("=")[1] || process.env.HOST || "0.0.0.0";

app.listen(port, host, () => {
  console.log(`Local DB server running at http://${host}:${port}`);
});
