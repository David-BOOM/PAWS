import axios from "axios";
import Constants from "expo-constants";

// Local development server base URL.
// For LAN access from real devices (Android/iOS/ESP8266), prefer setting an env var:
//   EXPO_PUBLIC_API_HOST=http://<YOUR-LAN-IP>:4100
// When unset, derive the LAN host from the Expo packager when possible.

const deriveExpoBaseUrl = () => {
  const rawHost =
    Constants?.expoConfig?.hostUri ??
    Constants?.manifest2?.extra?.expoClient?.hostUri ??
    Constants?.manifest?.debuggerHost ??
    null;

  if (!rawHost) {
    return null;
  }

  const hostPart = rawHost.split("@").pop()?.split(":")[0];
  if (!hostPart) {
    return null;
  }

  return `http://${hostPart}:4100`;
};

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_HOST || deriveExpoBaseUrl() || "http://127.0.0.1:4100";

const API = axios.create({
  baseURL: API_BASE_URL,
  timeout: 5000,
});

export const getDashboardData = () => API.get("/dashboard");
export const setFeedingSchedule = (data) => API.post("/feeding/schedule", data);
export const triggerQuickAction = (action) => API.post("/actions", { action });
export const getNotifications = () => API.get("/notifications");
export const updateSettings = (data) => API.post("/settings", data);

// Environment data from local JSON database
export const getEnvironmentCurrent = () => API.get("/api/files/environment-current");
export const getEnvironmentSeries = () => API.get("/api/files/environment");

export const listDatabaseFiles = () => API.get("/api/files");
export const readDatabaseFile = (name) => API.get(`/api/files/${name}`);
export const writeDatabaseFile = (name, data) => API.post(`/api/files/${name}`, data);
export const replaceDatabaseFile = (name, data) => API.put(`/api/files/${name}`, data);
export const patchDatabaseFile = (name, data) => API.patch(`/api/files/${name}`, data);
export const deleteDatabaseFile = (name) => API.delete(`/api/files/${name}`);

export default API;
