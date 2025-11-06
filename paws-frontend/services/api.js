import axios from "axios";

// Local development server base URL.
// For LAN access from real devices (Android/iOS/ESP8266), prefer setting an env var:
//   EXPO_PUBLIC_API_HOST=http://<YOUR-LAN-IP>:3000
// Otherwise it falls back to localhost (works on the same machine).
const HOST = process.env.EXPO_PUBLIC_API_HOST || "http://localhost:3000";

const API = axios.create({
  baseURL: HOST,
  timeout: 5000,
});

export const getDashboardData = () => API.get("/dashboard");
export const setFeedingSchedule = (data) => API.post("/feeding/schedule", data);
export const triggerQuickAction = (action) => API.post("/actions", { action });
export const getNotifications = () => API.get("/notifications");
export const updateSettings = (data) => API.post("/settings", data);

export default API;
