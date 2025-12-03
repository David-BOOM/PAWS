import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, "../../..");
const secretsPath = path.join(repoRoot, "config", "secrets.json");
const fallbackPath = path.join(repoRoot, "config", "secrets.example.json");
const headerPath = path.join(__dirname, "../include/generated-secrets.h");

const escapeValue = (value) => String(value ?? "").replace(/"/g, '\\"');

const loadSecrets = () => {
  const fileToLoad = fs.existsSync(secretsPath) ? secretsPath : fallbackPath;
  const raw = fs.readFileSync(fileToLoad, "utf-8");
  const json = JSON.parse(raw);
  if (!fs.existsSync(secretsPath)) {
    console.warn(
      `Warning: ${secretsPath} not found. Using example secrets, which should be replaced before flashing production hardware.`
    );
  }
  return json;
};

const buildHeader = (secrets) => {
  const wifi = secrets?.wifi ?? {};
  const server = secrets?.server ?? {};
  const lines = [
    "#pragma once",
    "",
    `#define SECRET_WIFI_SSID "${escapeValue(wifi.ssid)}"`,
    `#define SECRET_WIFI_PASS "${escapeValue(wifi.password)}"`,
    `#define SECRET_SERVER_HOST "${escapeValue(server.host)}"`,
    `#define SECRET_SERVER_PORT ${Number.isFinite(server.port) ? server.port : 0}`,
    "",
  ];
  return lines.join("\n");
};

const main = () => {
  const secrets = loadSecrets();
  const headerContents = buildHeader(secrets);
  fs.mkdirSync(path.dirname(headerPath), { recursive: true });
  fs.writeFileSync(headerPath, headerContents, "utf-8");
  console.log(`Secrets header synced to ${headerPath}`);
};

main();
