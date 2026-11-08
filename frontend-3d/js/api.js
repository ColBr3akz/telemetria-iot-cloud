// ============================================================
//  api.js — Cliente con timeout en todas las peticiones
// ============================================================

const PROD_API_URL = "https://TU-APP.onrender.com"; // ← editar tras deploy

const API_BASE =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "http://127.0.0.1:8000"
    : PROD_API_URL;

const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export const fetchAllPacientes = () =>
  fetchWithTimeout(`${API_BASE}/pacientes?activo=true`);

export const fetchPaciente = (id) =>
  fetchWithTimeout(`${API_BASE}/pacientes/${id}`);

export const fetchSignos = (pacienteId, limit = 1) =>
  fetchWithTimeout(
    `${API_BASE}/signos_vitales?paciente_id=${pacienteId}&limit=${limit}`
  );

export const fetchAlertasActivas = (pacienteId) =>
  fetchWithTimeout(
    `${API_BASE}/alertas?paciente_id=${pacienteId}&resuelta=false`
  );

export const fetchAllActiveAlerts = () =>
  fetchWithTimeout(`${API_BASE}/alertas?resuelta=false&limit=30`);

export function evaluarUmbral(umbrales, key, valor) {
  const cfg = umbrales?.[key] || {};
  const min = cfg.min ?? null;
  const max = cfg.max ?? null;
  if (min !== null && valor < min) return valor < min - 5 ? "rojo" : "naranja";
  if (max !== null && valor > max) return valor > max + 1 ? "rojo" : "naranja";
  return "verde";
}