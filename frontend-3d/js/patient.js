// REDISEÑO: paciente acostado boca arriba, con bata, manta, brazos/manos, rostro y 3 sensores (dedo, axila, pecho)
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { BED } from "./layout.js";

export function buildPatient(scene) {
  const group = new THREE.Group();
  group.position.set(BED.x, BED.topY, BED.z);   // origen: superficie del colchón, centro de la cama
  scene.add(group);

  const M = (c, r = 0.8) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const skin = M(0xd9a47f, 0.65), gown = M(0x9cc4dc, 0.9), hairM = M(0x2b2118, 0.9);
  const blanketM = M(0xe8eef3, 0.95), bandM = M(0x4a7fa8, 0.9), dark = M(0x3a2a22, 0.8);

  const add = (parent, geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };

  // Grupo que "respira": torso + sensores del tronco
  const breath = new THREE.Group();
  group.add(breath);

  // ---------- Torso (cápsula achatada) ----------
  const torsoWrap = new THREE.Group();
  torsoWrap.position.set(0, 0.12, -0.135);
  torsoWrap.scale.set(1.15, 0.7, 1);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.43, 8, 24), gown);
  torso.rotation.x = Math.PI / 2;
  torsoWrap.add(torso);
  breath.add(torsoWrap);

  // ---------- Cuello y cabeza ----------
  const neck = add(group, new THREE.CylinderGeometry(0.045, 0.05, 0.12, 16), skin, 0, 0.17, -0.585);
  neck.rotation.x = Math.PI / 2;

  const head = add(group, new THREE.SphereGeometry(0.105, 32, 24), skin, 0, 0.23, -0.7);
  head.scale.set(0.92, 1, 1.08);

  const hair = add(group, new THREE.SphereGeometry(0.108, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.4), hairM, 0, 0.23, -0.7);
  hair.rotation.x = -Math.PI / 2;      // el polo del casquete apunta hacia la cabecera
  hair.scale.set(0.92, 1.08, 1);

  [-1, 1].forEach((s) => {
    const ear = add(group, new THREE.SphereGeometry(0.02, 12, 10), skin, s * 0.1, 0.225, -0.7);
    ear.scale.set(0.5, 1, 0.8);
    add(group, new THREE.BoxGeometry(0.03, 0.004, 0.006), dark, s * 0.035, 0.326, -0.728);  // ojos cerrados
    add(group, new THREE.BoxGeometry(0.035, 0.004, 0.007), hairM, s * 0.036, 0.32, -0.745); // cejas
  });
  add(group, new THREE.SphereGeometry(0.016, 12, 10), skin, 0, 0.34, -0.675);               // nariz
  add(group, new THREE.BoxGeometry(0.04, 0.004, 0.008), M(0xb86b5c, 0.7), 0, 0.314, -0.63); // boca

  // ---------- Brazos y manos ----------
  const fingerLen = [0.035, 0.045, 0.042, 0.032];
  [1, -1].forEach((s) => {
    const x = 0.3 * s;
    add(group, new THREE.SphereGeometry(0.062, 16, 12), gown, 0.27 * s, 0.115, -0.45);
    const sleeve = add(group, new THREE.CapsuleGeometry(0.056, 0.16, 6, 16), gown, x, 0.07, -0.33);
    sleeve.rotation.x = Math.PI / 2;
    const fore = add(group, new THREE.CapsuleGeometry(0.045, 0.22, 6, 16), skin, x, 0.062, -0.04);
    fore.rotation.x = Math.PI / 2;
    add(group, new RoundedBoxGeometry(0.075, 0.03, 0.085, 2, 0.012), skin, x, 0.045, 0.155);
    fingerLen.forEach((L, i) => {
      const f = add(group, new THREE.CapsuleGeometry(0.009, L, 4, 8), skin, x + (-0.027 + 0.018 * i) * s, 0.04, 0.195 + (L + 0.018) / 2);
      f.rotation.x = Math.PI / 2;
    });
    const thumb = add(group, new THREE.CapsuleGeometry(0.01, 0.035, 4, 8), skin, x - 0.048 * s, 0.042, 0.14);
    thumb.rotation.x = Math.PI / 2;
  });

  // ---------- Manta ----------
  add(group, new RoundedBoxGeometry(1.46, 0.2, 0.8, 4, 0.06), blanketM, 0, 0.1, 0.65);
  add(group, new RoundedBoxGeometry(1.48, 0.21, 0.1, 3, 0.04), bandM, 0, 0.105, 0.3);
  [-1, 1].forEach((s) => {
    const ridge = add(group, new THREE.CapsuleGeometry(0.075, 0.5, 6, 16), blanketM, 0.14 * s, 0.165, 0.66);
    ridge.rotation.x = Math.PI / 2;   // bultos de las piernas bajo la manta
  });

  // ---------- SENSORES ----------
  const white = M(0xf2f4f6, 0.5);
  const disc = (r) => new THREE.CylinderGeometry(r, r, 0.008, 24);

  // 1) Pecho (se mueve con la respiración)
  add(breath, disc(0.026), white, 0.05, 0.24, -0.3);
  add(breath, new THREE.CylinderGeometry(0.009, 0.009, 0.012, 16), M(0x3fb950, 0.4), 0.05, 0.248, -0.3);

  // 2) Axila (flanco derecho, orientado hacia afuera/arriba)
  const axDisc = add(breath, disc(0.022), white, 0.186, 0.165, -0.4);
  axDisc.rotation.z = -1.0;
  const axBtn = add(breath, new THREE.CylinderGeometry(0.008, 0.008, 0.012, 16), M(0xd29922, 0.4), 0.192, 0.172, -0.4);
  axBtn.rotation.z = -1.0;

  // 3) Dedo índice de la mano derecha: pulsioxímetro de clip con LED rojo
  add(group, new RoundedBoxGeometry(0.03, 0.03, 0.05, 2, 0.006), M(0x1f2a37, 0.5), 0.273, 0.052, 0.215);
  add(group, new THREE.BoxGeometry(0.026, 0.006, 0.046), M(0xcfd8e0, 0.4), 0.273, 0.069, 0.215);
  add(group, new THREE.SphereGeometry(0.005, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0xff3b30, emissiveIntensity: 2 }), 0.273, 0.074, 0.228);

  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  // ---------- Respiración ----------
  let t = 0;
  function update(deltaSeconds, frecuenciaRespiratoria) {
    const fr = frecuenciaRespiratoria > 0 ? frecuenciaRespiratoria : 16;
    t += deltaSeconds * (fr / 60) * Math.PI * 2;
    const b = Math.sin(t);
    breath.scale.y = 1 + 0.05 * b;   // REDISEÑO: intensidad de la respiración (antes 0.04)
    breath.scale.x = 1 + 0.012 * b;
  }

  return { group, update };
}