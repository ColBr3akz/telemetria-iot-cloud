// REDISEÑO: equipo Raspberry Pi sobre el velador, con 3 cables que salen hacia los sensores del paciente
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { NIGHTSTAND_R, SENSORS_LOCAL, patientToWorld } from "./layout.js";

const LED_COLORS = { verde: 0x3fb950, naranja: 0xd29922, rojo: 0xf85149 };

function makeLabel() {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "#e6edf3"; g.fillRect(0, 0, 256, 64);
  g.fillStyle = "#0a0e14";
  g.font = "bold 30px Arial"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("Raspberry Pi 5", 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeCable(points, color) {
  const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.3);
  const mesh = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 90, 0.006, 8, false),
    new THREE.MeshStandardMaterial({ color, roughness: 0.55 })
  );
  mesh.castShadow = true;
  return mesh;
}

export function buildEquipment(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const cx = NIGHTSTAND_R.x, cz = NIGHTSTAND_R.z, top = NIGHTSTAND_R.topY;
  const BW = 0.3, BH = 0.07, BD = 0.21;

  // Caja
  const body = new THREE.Mesh(new RoundedBoxGeometry(BW, BH, BD, 4, 0.012),
    new THREE.MeshStandardMaterial({ color: 0x1b222b, roughness: 0.5, metalness: 0.25 }));
  body.position.set(cx, top + BH / 2, cz);
  body.castShadow = body.receiveShadow = true;
  group.add(body);

  const plate = new THREE.Mesh(new RoundedBoxGeometry(BW - 0.02, 0.004, BD - 0.02, 2, 0.002),
    new THREE.MeshStandardMaterial({ color: 0x2a3440, roughness: 0.4, metalness: 0.3 }));
  plate.position.set(cx, top + BH + 0.001, cz);
  group.add(plate);

  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.025), new THREE.MeshBasicMaterial({ map: makeLabel() }));
  label.rotation.x = -Math.PI / 2;
  label.position.set(cx - 0.04, top + BH + 0.004, cz - 0.05);
  group.add(label);

  for (let i = 0; i < 5; i++) {   // rejillas de ventilación
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.002, 0.005), new THREE.MeshStandardMaterial({ color: 0x0a0e14 }));
    v.position.set(cx + 0.05, top + BH + 0.004, cz - 0.07 + i * 0.012);
    group.add(v);
  }

  // LEDs: energía (verde fijo), comunicación (azul parpadeante), estado (color del paciente, pulsa con la FC)
  const mkLed = (color, r) => new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.5 }));
  const ledPower = mkLed(0x3fb950, 0.005);
  const ledComm = mkLed(0x58a6ff, 0.005);
  const ledStatus = mkLed(LED_COLORS.verde, 0.008);
  ledPower.position.set(cx + 0.06, top + BH + 0.005, cz + 0.07);
  ledComm.position.set(cx + 0.08, top + BH + 0.005, cz + 0.07);
  ledStatus.position.set(cx + 0.115, top + BH + 0.007, cz + 0.07);
  group.add(ledPower, ledComm, ledStatus);

  const statusLight = new THREE.PointLight(LED_COLORS.verde, 0.3, 1, 2);
  statusLight.position.set(cx + 0.115, top + BH + 0.06, cz + 0.07);
  group.add(statusLight);

  // ---------- Puertos + cables hacia los sensores ----------
  const portX = cx - BW / 2, portY = top + 0.043;
  const cols = { chest: 0x3fb950, axilla: 0xd29922, finger: 0x2f81f7 };
  const portZ = { chest: cz - 0.06, axilla: cz, finger: cz + 0.06 };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  Object.keys(cols).forEach((k) => {
    const port = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.016, 0.022), new THREE.MeshStandardMaterial({ color: cols[k], roughness: 0.5 }));
    port.position.set(portX - 0.004, portY, portZ[k]);
    group.add(port);
  });

  // REDISEÑO: puntos intermedios (mundo) para que los cables pasen sobre la cama y el brazo;
  // el punto final sale de layout.js (SENSORS_LOCAL). Si mueves cama/velador, ajusta estos puntos.
  group.add(makeCable([
    V(portX, portY, portZ.chest), V(0.1, 0.566, -2.75), V(-0.06, 0.62, -2.64), V(-0.28, 0.72, -2.52),
    V(-0.48, 0.78, -2.4), V(-0.62, 0.79, -2.27), patientToWorld(SENSORS_LOCAL.chest),
  ], cols.chest));

  group.add(makeCable([
    V(portX, portY, portZ.axilla), V(0.1, 0.57, -2.68), V(-0.1, 0.64, -2.58), V(-0.3, 0.74, -2.38),
    V(-0.45, 0.77, -2.33), V(-0.58, 0.735, -2.31), patientToWorld(SENSORS_LOCAL.axilla),
  ], cols.axilla));

  group.add(makeCable([
    V(portX, portY, portZ.finger), V(0.1, 0.566, -2.62), V(0.02, 0.575, -2.4), V(-0.12, 0.575, -2.05),
    V(-0.3, 0.6, -1.84), V(-0.46, 0.64, -1.74), patientToWorld(SENSORS_LOCAL.finger),
  ], cols.finger));

  // ---------- Animación ----------
  let phase = 0, time = 0;
  const tmp = new THREE.Color();
  function update(deltaSeconds, frecuenciaCardiaca, estado) {
    time += deltaSeconds;
    const bps = (frecuenciaCardiaca > 0 ? frecuenciaCardiaca : 60) / 60;   // pulso = FC real
    phase += deltaSeconds * bps * Math.PI * 2;
    const pulse = (Math.sin(phase) + 1) / 2;

    tmp.setHex(LED_COLORS[estado] ?? LED_COLORS.verde);
    ledStatus.material.color.copy(tmp);
    ledStatus.material.emissive.copy(tmp);
    ledStatus.material.emissiveIntensity = 0.8 + 2.4 * pulse;   // REDISEÑO: intensidad del pulso
    statusLight.color.copy(tmp);
    statusLight.intensity = 0.05 + 0.5 * pulse;
    ledComm.material.emissiveIntensity = Math.sin(time * 6) > 0.3 ? 2 : 0.2;
  }

  return { group, update };
}