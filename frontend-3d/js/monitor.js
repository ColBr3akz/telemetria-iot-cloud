// REDISEÑO: monitor clínico: ECG + pletismografía en vivo (barrido), 4 tarjetas de signos, chip de estado
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { ROOM } from "./layout.js";

const CW = 2048, CH = 1024;                       // resolución (no bajar de 1024×512)
const STATE_COLOR = { verde: "#3fb950", naranja: "#d29922", rojo: "#f85149" };
const STATE_TEXT = { verde: "ESTABLE", naranja: "PRECAUCIÓN", rojo: "CRÍTICO" };
const FONT = '"Inter", "Segoe UI", Arial, sans-serif';

const g = (x, c, w) => Math.exp(-0.5 * ((x - c) / w) ** 2);
const ecg = (p) => 0.12 * g(p, 0.17, 0.03) - 0.1 * g(p, 0.295, 0.008) + 1.0 * g(p, 0.32, 0.009) - 0.22 * g(p, 0.35, 0.01) + 0.25 * g(p, 0.55, 0.045);
const pleth = (p) => g(p, 0.22, 0.1) + 0.32 * g(p, 0.55, 0.08);

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function buildMonitor(scene, renderer) {
  const canvas = document.createElement("canvas");
  canvas.width = CW; canvas.height = CH;
  const ctx = canvas.getContext("2d");

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

  // ---------- Geometría: marco + pantalla en la pared del fondo ----------
  const group = new THREE.Group();
  group.position.set(1.9, 1.75, -ROOM.D / 2 + 0.03);
  scene.add(group);

  const bezel = new THREE.Mesh(new RoundedBoxGeometry(2.32, 1.22, 0.06, 3, 0.025),
    new THREE.MeshStandardMaterial({ color: 0x10151c, roughness: 0.35, metalness: 0.5 }));
  bezel.castShadow = true;
  group.add(bezel);

  const monitor = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
  monitor.position.z = 0.032;
  group.add(monitor);

  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.04), new THREE.MeshStandardMaterial({ color: 0x1b222b, metalness: 0.4, roughness: 0.5 }));
  stand.position.set(0, -0.63, 0);
  group.add(stand);

  // ---------- Estado de las ondas ----------
  const N = 315, STEP = 4, GAP = 14, SAMPLE_DT = 1 / 90;
  const ecgBuf = new Float32Array(N), plethBuf = new Float32Array(N);
  let head = 0, acc = 0, phase = 0, time = 0;

  function wave(buf, x0, y0, w, h, color, mapY) {
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.lineJoin = "round";
    ctx.shadowColor = color; ctx.shadowBlur = 14;
    ctx.beginPath();
    let pen = false;
    const start = (head + GAP) % N;
    for (let k = 0; k < N - GAP; k++) {
      const idx = (start + k) % N;
      const x = x0 + 30 + idx * STEP, y = mapY(buf[idx], y0, h);
      if (!pen || idx === 0) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function panel(x, y, w, h, title, color) {
    rr(ctx, x, y, w, h, 24);
    ctx.fillStyle = "rgba(255,255,255,0.035)"; ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.09)"; ctx.lineWidth = 2; ctx.stroke();
    ctx.save();
    rr(ctx, x, y, w, h, 24); ctx.clip();
    ctx.strokeStyle = "rgba(63,185,80,0.07)"; ctx.lineWidth = 1;
    for (let gx = x; gx < x + w; gx += 60) { ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx, y + h); ctx.stroke(); }
    for (let gy = y; gy < y + h; gy += 60) { ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + w, gy); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = color; ctx.font = `600 30px ${FONT}`; ctx.textAlign = "left";
    ctx.fillText(title, x + 30, y + 46);
  }

  function card(x, y, w, h, label, unit, value, color) {
    rr(ctx, x, y, w, h, 22);
    ctx.fillStyle = "rgba(255,255,255,0.045)"; ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.09)"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = color; rr(ctx, x, y + 24, 8, h - 48, 4); ctx.fill();
    ctx.fillStyle = "#8b98a8"; ctx.font = `600 32px ${FONT}`; ctx.textAlign = "left";
    ctx.fillText(label, x + 36, y + 56);
    ctx.textAlign = "right"; ctx.font = `500 32px ${FONT}`;
    ctx.fillText(unit, x + w - 30, y + 56);
    ctx.fillStyle = color; ctx.font = `700 118px ${FONT}`; ctx.textAlign = "left";
    ctx.shadowColor = color; ctx.shadowBlur = 16;
    ctx.fillText(value, x + 36, y + h - 28);
    ctx.shadowBlur = 0;
  }

  // ---------- draw() — se llama cada frame (contrato intacto) ----------
  function draw(signos, deltaSeconds, estado) {
    const dt = Math.min(deltaSeconds || 0.016, 0.1);
    time += dt;
    const s = signos || {};
    const hr = s.frecuencia_cardiaca > 0 ? s.frecuencia_cardiaca : 72;
    const amp = THREE.MathUtils.clamp(((s.spo2 ?? 95) - 70) / 25, 0.35, 1);
    const col = STATE_COLOR[estado] || STATE_COLOR.verde;

    acc += dt;
    while (acc >= SAMPLE_DT) {
      acc -= SAMPLE_DT;
      phase = (phase + SAMPLE_DT * hr / 60) % 1;
      ecgBuf[head] = ecg(phase) + (Math.random() - 0.5) * 0.01;
      plethBuf[head] = pleth((phase + 0.1) % 1) * amp;
      head = (head + 1) % N;
    }

    // Fondo
    const bg = ctx.createLinearGradient(0, 0, 0, CH);
    bg.addColorStop(0, "#0a0f16"); bg.addColorStop(1, "#0d1620");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, CW, CH);

    // Cabecera
    ctx.textAlign = "left"; ctx.fillStyle = "#e6edf3"; ctx.font = `700 46px ${FONT}`;
    ctx.fillText("SIGNOS VITALES", 40, 62);
    ctx.fillStyle = "#8b98a8"; ctx.font = `500 26px ${FONT}`;
    ctx.fillText("MONITOR EN TIEMPO REAL", 40, 98);

    // Chip de estado
    const cw = 360, cx = CW - 40 - cw;
    rr(ctx, cx, 22, cw, 70, 35);
    ctx.fillStyle = col + "26"; ctx.fill();
    ctx.strokeStyle = estado === "rojo" && Math.sin(time * 8) > 0 ? "#ffffff" : col; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(cx + 38, 57, 11 + 2 * Math.sin(time * 5), 0, Math.PI * 2); ctx.fill();
    ctx.font = `700 36px ${FONT}`; ctx.textAlign = "center";
    ctx.fillText(STATE_TEXT[estado] || "—", cx + cw / 2 + 18, 70);

    // Ondas
    panel(40, 130, 1330, 410, "ECG · II", "#3fb950");
    wave(ecgBuf, 40, 130, 1330, 410, "#3fb950", (v, y0, h) => y0 + h * 0.75 - v * h * 0.5);
    panel(40, 556, 1330, 402, "PLETISMOGRAFÍA · SpO₂", "#39c5cf");
    wave(plethBuf, 40, 556, 1330, 402, "#39c5cf", (v, y0, h) => y0 + h * 0.88 - v * h * 0.62);

    // Tarjetas
    const f = (v, d = 0) => (v === null || v === undefined || Number.isNaN(Number(v)) ? "--" : Number(v).toFixed(d));
    const cx2 = 1400, cwid = 608, chei = 195;
    card(cx2, 130, cwid, chei, "SpO₂", "%", f(s.spo2), "#39c5cf");
    card(cx2, 341, cwid, chei, "FREC. CARDÍACA", "bpm", f(s.frecuencia_cardiaca), "#3fb950");
    card(cx2, 552, cwid, chei, "FREC. RESPIRATORIA", "rpm", f(s.frecuencia_respiratoria), "#e3b341");
    card(cx2, 763, cwid, chei, "TEMPERATURA", "°C", f(s.temperatura, 1), "#f0883e");

    texture.needsUpdate = true;   // NO QUITAR: redibuja la textura cada frame
  }

  return { monitor, draw };
}