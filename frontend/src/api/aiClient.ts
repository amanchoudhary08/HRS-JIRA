import axios from "axios";

export const AI_URL = import.meta.env.VITE_AI_URL ?? "http://localhost:8000";

export const aiClient = axios.create({
  baseURL: `${AI_URL}/api`,
});

// Attach the JWT from localStorage before every request
aiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("taskflow_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// A 401 from the AI service means the AI backend rejected the token,
// but it does NOT mean the HRS-JIRA session is invalid — never clear
// the taskflow_token or redirect to login from here.
aiClient.interceptors.response.use(
  (res) => res,
  (err) => Promise.reject(err),
);
