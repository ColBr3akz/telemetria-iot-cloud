// ============================================================
//  main.js — Polling robusto + refresh de pacientes
//  + NUEVO: Sistema de alertas sonoras (Web Audio API)
// ============================================================
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import {
  fetchAllPacientes,
  fetchSignos,
  fetchAllActiveAlerts,
  evaluarUmbral,
} from "./api.js";
import { buildRoom } from "./room.js";
import { buildPatient } from "./patient.js";
import { buildEquipment } from "./equipment.js";
import { buildMonitor } from "./monitor.js";
import { ROOM } from "./layout.js";

const POLL_INTERVAL_MS = 5000;
const REFRESH_PATIENTS_MS = 30000;
const SOUND_COOLDOWN_MS = 12000;

const state = {
  pacientesCache: [],
  paciente: null,
  signos: null,
  ultimoEstado: "verde",
  alertasGlobales: [],
  lastError: null,
};

const audio = {
  ctx: null,
  enabled: false,
  seenAlertIds: new Set(),
  lastSoundAt: 0,
  firstLoadDone: false,
};

// ============================================================
//  SISTEMA DE AUDIO (Web Audio API)
// ============================================================
function initAudioContext() {
  if (audio.ctx) {
    if (audio.ctx.state === "suspended") audio.ctx.resume();
    return;
  }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  audio.ctx = new Ctx();
}

function playTone(freq, duration, type = "sine", when = 0, gainValue = 0.25) {
  if (!audio.ctx || !audio.enabled) return;
  const osc = audio.ctx.createOscillator();
  const gain = audio.ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = 0;
  osc.connect(gain);
  gain.connect(audio.ctx.destination);

  const t = audio.ctx.currentTime + when;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(gainValue, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

  osc.start(t);
  osc.stop(t + duration);
}

function playCriticalSound() {
  playTone(880, 0.18, "square", 0, 0.22);
  playTone(880, 0.18, "square", 0.22, 0.22);
  playTone(880, 0.18, "square", 0.44, 0.22);
}

function playWarningSound() {
  playTone(523, 0.22, "sine", 0, 0.18);
  playTone(523, 0.22, "sine", 0.32, 0.18);
}

// ============================================================
//  DETECCIÓN DE ALERTAS NUEVAS + TOASTS
// ============================================================
function getNewAlerts(alerts) {
  if (!audio.firstLoadDone) {
    alerts.forEach((a) => audio.seenAlertIds.add(a.id));
    audio.firstLoadDone = true;
    return [];
  }
  const newOnes = alerts.filter((a) => !audio.seenAlertIds.has(a.id));
  alerts.forEach((a) => audio.seenAlertIds.add(a.id));
  return newOnes;
}

function groupByPatient(alerts) {
  const map = new Map();
  alerts.forEach((a) => {
    const existing = map.get(a.paciente_id);
    if (!existing || (existing.tipo !== "rojo" && a.tipo === "rojo")) {
      map.set(a.paciente_id, a);
    }
  });
  return Array.from(map.values());
}

function showToast(alerta, paciente) {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast ${alerta.tipo}`;
  const icon = alerta.tipo === "rojo" ? "🚨" : "⚠️";
  const title = alerta.tipo === "rojo" ? "Alerta crítica" : "Precaución";
  toast.innerHTML = `
    <div class="toast-header">${icon} ${title}</div>
    <div class="toast-patient">${paciente?.nombre || "Paciente"}</div>
    <div class="toast-msg">${alerta.mensaje}</div>
  `;

  toast.addEventListener("click", () => {
    if (paciente) {
      const sel = document.getElementById("patient-select");
      sel.value = paciente.id;
      sel.dispatchEvent(new Event("change"));
    }
    toast.remove();
  });

  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 350);
  }, 6000);
}

function highlightAlertsInPanel(pacienteIds) {
  setTimeout(() => {
    document.querySelectorAll("#alerts-list .alert-item").forEach((el) => {
      const name = el.querySelector(".alert-name")?.textContent || "";
      const isMatch = pacienteIds.some((pid) => {
        const p = state.pacientesCache.find((x) => x.id === pid);
        return p && name.includes(p.nombre);
      });
      if (isMatch) {
        el.classList.add("new");
        setTimeout(() => el.classList.remove("new"), 3500);
      }
    });
  }, 50);
}

function handleNewAlerts(newOnes) {
  if (newOnes.length === 0) return;

  const grouped = groupByPatient(newOnes);
  const hasCritical = grouped.some((a) => a.tipo === "rojo");

  if (audio.enabled && Date.now() - audio.lastSoundAt >= SOUND_COOLDOWN_MS) {
    audio.lastSoundAt = Date.now();
    if (hasCritical) playCriticalSound();
    else playWarningSound();
  }

  grouped.slice(0, 2).forEach((a) => {
    const p = state.pacientesCache.find((x) => x.id === a.paciente_id);
    showToast(a, p);
  });

  highlightAlertsInPanel(grouped.map((a) => a.paciente_id));
}

// ============================================================
//  Escena 3D
// ============================================================
const container = document.getElementById("scene-container");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0e14);
scene.fog = null;

const camera = new THREE.PerspectiveCamera(
  50, window.innerWidth / window.innerHeight, 0.05, 200
);
camera.position.set(2.4, 1.9, 2.4);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(-0.3, 1.0, -1.8);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1.5;
controls.maxDistance = 5.5;
controls.maxPolarAngle = Math.PI * 0.52;
controls.minPolarAngle = 0.35;
controls.rotateSpeed = 0.7;
controls.zoomSpeed = 0.9;
controls.panSpeed = 0.8;
controls.screenSpacePanning = true;
controls.update();

const MARGIN = 0.35;
const camMin = new THREE.Vector3(-ROOM.W / 2 + MARGIN, 0.5, -ROOM.D / 2 + MARGIN);
const camMax = new THREE.Vector3(ROOM.W / 2 - MARGIN, ROOM.H - 0.25, ROOM.D / 2 - MARGIN);
const tgtMin = new THREE.Vector3(-2.5, 0.3, -2.5);
const tgtMax = new THREE.Vector3(2.5, 2.0, 2.2);
controls.addEventListener("change", () => {
  controls.target.clamp(tgtMin, tgtMax);
  camera.position.clamp(camMin, camMax);
  camera.lookAt(controls.target);
});

scene.add(new THREE.HemisphereLight(0xeaf2fb, 0x9b8b78, 0.9));

const keyLight = new THREE.DirectionalLight(0xfff4e6, 1.2);
keyLight.position.set(3, 2.8, 2.5);
keyLight.target.position.set(-0.5, 0, -1.5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -5;
keyLight.shadow.camera.right = 5;
keyLight.shadow.camera.top = 5;
keyLight.shadow.camera.bottom = -5;
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 14;
keyLight.shadow.bias = -0.0004;
keyLight.shadow.normalBias = 0.02;
scene.add(keyLight, keyLight.target);

buildRoom(scene);
const patient = buildPatient(scene);
const equipment = buildEquipment(scene);
const monitor = buildMonitor(scene, renderer);

// ---------- HUD ----------
function setPill(id, sev) {
  const el = document.getElementById(id);
  el.className = `pill ${sev}`;
  el.textContent = sev === "verde" ? "OK" : sev === "naranja" ? "⚠" : "⚠⚠";
}

function setStatus(valor) {
  const el = document.getElementById("status-value");
  el.className = `status-value ${valor}`;
  el.textContent =
    valor === "rojo" ? "CRÍTICO" : valor === "naranja" ? "PRECAUCIÓN" : "ESTABLE";
}

function updateHUD() {
  const p = state.paciente;
  const s = state.signos;
  if (!p) return;

  document.getElementById("patient-name").textContent = p.nombre;
  document.getElementById("patient-diagnostico").textContent =
    p.diagnostico || "—";

  if (s) {
    document.getElementById("spo2").textContent = s.spo2;
    document.getElementById("fc").textContent = s.frecuencia_cardiaca;
    document.getElementById("fr").textContent = s.frecuencia_respiratoria;
    document.getElementById("temp").textContent = s.temperatura.toFixed(1);

    const u = p.umbrales || {};
    setPill("spo2-pill", evaluarUmbral(u, "spo2", s.spo2));
    setPill("fc-pill", evaluarUmbral(u, "fc", s.frecuencia_cardiaca));
    setPill("fr-pill", evaluarUmbral(u, "fr", s.frecuencia_respiratoria));
    setPill("temp-pill", evaluarUmbral(u, "temperatura", s.temperatura));

    document.getElementById("last-update").textContent =
      new Date(s.fecha_registro).toLocaleString("es-BO");
  }
  setStatus(state.ultimoEstado);

  const apiS = document.getElementById("api-status");
  if (state.lastError) {
    apiS.textContent = `✗ ${state.lastError}`;
    apiS.className = "api-status error";
  } else {
    apiS.textContent = "✓ Conectado a la API";
    apiS.className = "api-status ok";
  }
}

// ---------- Panel de alertas ----------
function renderAlertsPanel() {
  const list = document.getElementById("alerts-list");
  const empty = document.getElementById("alerts-empty");
  const count = document.getElementById("alerts-count");

  const byPatient = new Map();
  state.alertasGlobales.forEach((a) => {
    if (!byPatient.has(a.paciente_id)) byPatient.set(a.paciente_id, a);
  });
  const entries = Array.from(byPatient.values());

  list.innerHTML = "";

  if (entries.length === 0) {
    empty.style.display = "block";
    list.style.display = "none";
    count.textContent = "0";
    return;
  }

  empty.style.display = "none";
  list.style.display = "flex";
  count.textContent = entries.length;

  entries.forEach((a) => {
    const p = state.pacientesCache.find((x) => x.id === a.paciente_id);
    const li = document.createElement("li");
    li.className = `alert-item ${a.tipo}`;
    const icon = a.tipo === "rojo" ? "🚨" : "⚠️";
    li.innerHTML = `
      <div class="alert-name">${icon} ${p?.nombre || "Paciente"}</div>
      <div class="alert-msg">${a.mensaje}</div>
    `;
    li.addEventListener("click", () => {
      if (!p) return;
      const sel = document.getElementById("patient-select");
      sel.value = p.id;
      sel.dispatchEvent(new Event("change"));
    });
    list.appendChild(li);
  });
}

// ---------- Cargar pacientes ----------
async function cargarPacientes() {
  try {
    const pacientes = await fetchAllPacientes();
    state.pacientesCache = pacientes;

    const sel = document.getElementById("patient-select");
    const currentId = sel.value || (state.paciente && state.paciente.id);
    sel.innerHTML = "";

    if (pacientes.length === 0) {
      const opt = document.createElement("option");
      opt.textContent = "Sin pacientes";
      sel.appendChild(opt);
      return;
    }

    pacientes.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = `${p.nombre} · ${p.dispositivo_id || "sin equipo"}`;
      sel.appendChild(opt);
    });

    const stillExists = pacientes.find((p) => p.id === currentId);
    const target = stillExists || pacientes[0];
    sel.value = target.id;
    state.paciente = target;

    state.lastError = null;
  } catch (e) {
    console.error("cargarPacientes:", e);
    state.lastError = e.message;
  }
}

document.getElementById("patient-select").addEventListener("change", (e) => {
  const p = state.pacientesCache.find((x) => x.id === e.target.value);
  if (p) {
    state.paciente = p;
    state.signos = null;
    poll();
  }
});

document.getElementById("sound-toggle").addEventListener("click", () => {
  initAudioContext();
  audio.enabled = !audio.enabled;

  const btn = document.getElementById("sound-toggle");
  btn.classList.toggle("on", audio.enabled);
  btn.title = audio.enabled
    ? "Sonido activado · clic para silenciar"
    : "Activar sonido de alertas";
  btn.setAttribute(
    "aria-label",
    audio.enabled ? "Silenciar alertas" : "Activar sonido de alertas"
  );

  if (audio.enabled) {
    playTone(660, 0.15, "sine", 0, 0.15);
  }
});

// ---------- Polling ----------
async function poll() {
  if (state.paciente) {
    try {
      const signos = await fetchSignos(state.paciente.id, 1);
      state.signos = signos[0] || null;

      let estado = "verde";
      if (state.signos) {
        const u = state.paciente.umbrales || {};
        const sev = [
          evaluarUmbral(u, "spo2", state.signos.spo2),
          evaluarUmbral(u, "fc", state.signos.frecuencia_cardiaca),
          evaluarUmbral(u, "fr", state.signos.frecuencia_respiratoria),
          evaluarUmbral(u, "temperatura", state.signos.temperatura),
        ];
        if (sev.includes("rojo")) estado = "rojo";
        else if (sev.includes("naranja")) estado = "naranja";
      }
      state.ultimoEstado = estado;
      state.lastError = null;
    } catch (e) {
      console.error("poll signos:", e);
      state.lastError = `signos: ${e.message}`;
    }
  }

  try {
    const alerts = await fetchAllActiveAlerts();
    const newOnes = getNewAlerts(alerts);
    state.alertasGlobales = alerts;
    renderAlertsPanel();
    handleNewAlerts(newOnes);
  } catch (e) {
    console.warn("poll alertas:", e);
  }

  updateHUD();
}

// ---------- Animación ----------
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  controls.update();

  if (state.signos) {
    patient.update(delta, state.signos.frecuencia_respiratoria);
    equipment.update(delta, state.signos.frecuencia_cardiaca, state.ultimoEstado);
    monitor.draw(state.signos, delta, state.ultimoEstado);
  } else {
    monitor.draw({}, delta, "verde");
  }

  renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- NUEVO: Lógica del botón de Inteligencia Artificial ----------
document.getElementById("btn-ai-summary").addEventListener("click", async () => {
  if (!state.paciente) return alert("Selecciona un paciente primero");
  
  const btn = document.getElementById("btn-ai-summary");
  const txt = document.getElementById("ai-summary-text");
  const originalHtml = btn.innerHTML;

  btn.innerHTML = `<span class="animate-pulse">Generando análisis...</span>`;
  btn.disabled = true;
  txt.classList.add("hidden");

  try {
    const baseUrl = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" 
      ? "http://127.0.0.1:8000" 
      : "https://telemetria-iot-api.onrender.com";

    const res = await fetch(`${baseUrl}/ai/resumen/${state.paciente.id}`, {
      method: "POST"
    });
    
    if (!res.ok) throw new Error("Error en la API");
    const data = await res.json();
    
    txt.textContent = data.resumen;
    txt.classList.remove("hidden");
  } catch (e) {
    txt.textContent = "Hubo un error al conectar con el servicio de IA.";
    txt.classList.remove("hidden");
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }
});

// ---------- Arranque ----------
(async () => {
  await cargarPacientes();
  await poll();
  setInterval(poll, POLL_INTERVAL_MS);
  setInterval(cargarPacientes, REFRESH_PATIENTS_MS);
  animate();
})();