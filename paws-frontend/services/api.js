import axios from "axios";

const API = axios.create({
  baseURL: "http://192.168.128.56:5000/dashboard", // Replace NULL with your backend URL
  timeout: 5000,
});

export const getDashboardData = () => API.get("/dashboard");
export const setFeedingSchedule = (data) => API.post("/feeding/schedule", data);
export const triggerQuickAction = (action) => API.post("/actions", { action });
export const getNotifications = () => API.get("/notifications");
export const updateSettings = (data) => API.post("/settings", data);

export default API;