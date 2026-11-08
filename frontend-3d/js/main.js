// ============================================================
//  main.js — Polling robusto + refresh de pacientes
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
import { ROOM } from "./layout.js"; // REDISEÑO: medidas de la habitación para limitar la cámara

const POLL_INTERVAL_MS = 5000;
const REFRESH_PATIENTS_MS = 30000;

const state = {
  pacientesCache: [],
  paciente: null,
  signos: null,
  ultimoEstado: "verde",
  alertasGlobales: [],
  lastError: null,
};

// ---------- Escena ----------
const container = document.getElementById("scene-container");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0e14);
// REDISEÑO: sin niebla (habitación cerrada)
scene.fog = null;

// REDISEÑO: FOV 50 y cámara inicial DENTRO de la habitación
const camera = new THREE.PerspectiveCamera(
  50, window.innerWidth / window.innerHeight, 0.05, 200
);
camera.position.set(2.4, 1.9, 2.4);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// REDISEÑO: colores más naturales y cinematográficos
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
// REDISEÑO: la cámara mira hacia la cama / el monitor
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

// REDISEÑO: la cámara y el punto de mira NUNCA salen de la habitación
// (ni al girar, ni al hacer zoom, ni al mover con clic derecho)
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

// REDISEÑO: iluminación suave y cálida (reemplaza ambient + fillLight azul)
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
    apiS.className = "api-status ok"; // REDISEÑO: ahora se ve en verde cuando hay conexión
  }
}

// ---------- Panel de alertas ----------
function renderAlertsPanel() {
  const list = document.getElementById("alerts-list");
  const empty = document.getElementById("alerts-empty");
  const count = document.getElementById("alerts-count");

  // Agrupar por paciente (1 entrada por paciente)
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

    // Preservar selección si sigue existiendo
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

// ---------- Polling robusto ----------
async function poll() {
  // 1. PRIORIDAD: signos del paciente seleccionado
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

  // 2. Alertas globales (no bloquea si falla)
  try {
    state.alertasGlobales = await fetchAllActiveAlerts();
    renderAlertsPanel();
  } catch (e) {
    console.warn("poll alertas:", e);
  }

  // 3. Actualizar HUD siempre
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

// ---------- Arranque ----------
(async () => {
  await cargarPacientes();
  await poll();
  setInterval(poll, POLL_INTERVAL_MS);
  setInterval(cargarPacientes, REFRESH_PATIENTS_MS); // refrescar lista cada 30s
  animate();
})();