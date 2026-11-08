// REDISEÑO: habitación moderna (paredes, piso de roble, ventana con cortinas, cama, mobiliario, luces propias)
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { ROOM, BED, NIGHTSTAND_R, NIGHTSTAND_L } from "./layout.js";

const { W: ROOM_W, D: ROOM_D, H: ROOM_H } = ROOM;

const mat = (color, rough = 0.75, metal = 0, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });

function box(parent, w, h, d, material, x, y, z, r = 0, cast = true) {
  const geo = r > 0
    ? new RoundedBoxGeometry(w, h, d, 3, Math.min(r, Math.min(w, h, d) / 2 - 0.001))
    : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function cyl(parent, rt, rb, h, material, x, y, z, seg = 28) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// ---------- Texturas generadas por código (sin archivos externos) ----------
function makeWoodTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 1024;
  const g = c.getContext("2d");
  const rows = 16, rh = c.height / rows;
  for (let r = 0; r < rows; r++) {
    const joint = (r * 211 + 97) % 1024;
    [[0, joint], [joint, 1024]].forEach(([x0, x1]) => {
      const t = 0.9 + Math.random() * 0.18;
      g.fillStyle = `rgb(${Math.round(203 * t)},${Math.round(168 * t)},${Math.round(128 * t)})`;
      g.fillRect(x0, r * rh, x1 - x0, rh);
      for (let i = 0; i < 7; i++) {
        g.fillStyle = `rgba(120,85,50,${0.04 + Math.random() * 0.05})`;
        g.fillRect(x0, r * rh + Math.random() * rh, x1 - x0, 1);
      }
      g.fillStyle = "rgba(60,40,20,0.35)";
      g.fillRect(x0, r * rh, 2, rh);
    });
    g.fillStyle = "rgba(60,40,20,0.3)";
    g.fillRect(0, r * rh + rh - 2, 1024, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(ROOM_W / 2.4, ROOM_D / 2.4);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeSkyTexture() {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 400;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 400);
  grad.addColorStop(0, "#7fb4e8");
  grad.addColorStop(1, "#e3f0fa");
  g.fillStyle = grad; g.fillRect(0, 0, 512, 400);
  g.fillStyle = "rgba(255,255,255,0.75)";
  [[120, 120, 90, 28], [300, 90, 110, 30], [400, 190, 80, 24], [200, 230, 100, 26]].forEach(([x, y, rx, ry]) => {
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
  });
  g.fillStyle = "#8fb98f"; // línea de árboles lejana
  g.fillRect(0, 340, 512, 60);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeArtTexture() {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 600;
  const g = c.getContext("2d");
  g.fillStyle = "#f3efe7"; g.fillRect(0, 0, 1024, 600);
  const layers = [["#d9b98a", 400, 40], ["#6f9fb8", 330, 55], ["#3e7490", 440, 45]];
  layers.forEach(([col, base, amp], i) => {
    g.fillStyle = col; g.beginPath(); g.moveTo(0, 600);
    for (let x = 0; x <= 1024; x += 8) g.lineTo(x, base + Math.sin(x / 120 + i * 1.7) * amp);
    g.lineTo(1024, 600); g.closePath(); g.fill();
  });
  g.fillStyle = "#f0c27a"; g.beginPath(); g.arc(760, 170, 62, 0, Math.PI * 2); g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- Piezas reutilizables ----------
function makePlant(scale = 1) {
  const g = new THREE.Group();
  cyl(g, 0.16, 0.12, 0.28, mat(0xe8e2d6, 0.8), 0, 0.14, 0);
  cyl(g, 0.15, 0.15, 0.02, mat(0x3b2f26, 1), 0, 0.28, 0);
  const l1 = mat(0x3f8a4f, 0.7), l2 = mat(0x58a768, 0.7);
  for (let i = 0; i < 16; i++) {
    const a = i * 2.399, rr = 0.03 + 0.07 * ((i % 5) / 5);
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), i % 2 ? l1 : l2);
    leaf.scale.set(0.45, 1.8, 0.2);
    leaf.position.set(Math.cos(a) * rr, 0.46 + (i % 4) * 0.09, Math.sin(a) * rr);
    leaf.rotation.set(Math.sin(a) * 0.6, a, -Math.cos(a) * 0.6);
    leaf.castShadow = true;
    g.add(leaf);
  }
  g.scale.setScalar(scale);
  return g;
}

function makeNightstand(cfg) {
  const g = new THREE.Group();
  const wood = mat(0x8a6a4f, 0.6), top = mat(0xa98363, 0.5);
  box(g, 0.55, 0.39, 0.45, wood, cfg.x, 0.295, cfg.z, 0.01);
  box(g, 0.58, 0.03, 0.48, top, cfg.x, 0.505, cfg.z, 0.01);
  box(g, 0.47, 0.15, 0.01, mat(0x74583f, 0.6), cfg.x, 0.37, cfg.z + 0.228, 0.004);
  cyl(g, 0.012, 0.012, 0.04, mat(0xcfd6dc, 0.3, 0.8), cfg.x, 0.37, cfg.z + 0.25, 12).rotation.x = Math.PI / 2;
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) =>
    cyl(g, 0.018, 0.014, 0.1, wood, cfg.x + sx * 0.23, 0.05, cfg.z + sz * 0.18, 12));
  return g;
}

function makeArmchair() {
  const g = new THREE.Group();
  const fab = mat(0x5d8197, 0.95), wood = mat(0x8a6a4f, 0.6);
  box(g, 0.62, 0.16, 0.58, fab, 0, 0.38, 0, 0.05);
  const back = box(g, 0.62, 0.5, 0.12, fab, 0, 0.66, -0.27, 0.05);
  back.rotation.x = -0.15;
  box(g, 0.1, 0.28, 0.5, fab, -0.36, 0.5, 0, 0.04);
  box(g, 0.1, 0.28, 0.5, fab, 0.36, 0.5, 0, 0.04);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) =>
    cyl(g, 0.025, 0.018, 0.3, wood, sx * 0.28, 0.15, sz * 0.24, 12));
  return g;
}

export function buildRoom(scene) {
  const room = new THREE.Group();
  scene.add(room);

  // ---------- Piso de roble ----------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D), mat(0xffffff, 0.55, 0, { map: makeWoodTexture() }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  room.add(floor);

  // ---------- Paredes (4, cerradas: la cámara queda siempre dentro) ----------
  const wallMat = mat(0xf1eee8, 0.95);
  const accentMat = mat(0xb4c3cf, 0.95); // pared de la cama, gris azulado suave
  box(room, ROOM_W + 0.4, ROOM_H, 0.2, accentMat, 0, ROOM_H / 2, -ROOM_D / 2 - 0.1, 0, false);
  box(room, ROOM_W + 0.4, ROOM_H, 0.2, wallMat, 0, ROOM_H / 2, ROOM_D / 2 + 0.1, 0, false);
  box(room, 0.2, ROOM_H, ROOM_D + 0.4, wallMat, -ROOM_W / 2 - 0.1, ROOM_H / 2, 0, 0, false);
  box(room, 0.2, ROOM_H, ROOM_D + 0.4, wallMat, ROOM_W / 2 + 0.1, ROOM_H / 2, 0, 0, false);

  // ---------- Techo (no proyecta sombra, para no oscurecer la sala) ----------
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D), mat(0xfafafa, 0.95));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = ROOM_H;
  room.add(ceiling);

  // Panel de luz del techo
  const panelMat = mat(0xffffff, 0.4, 0, { emissive: 0xfff3dc, emissiveIntensity: 1.4 });
  cyl(room, 0.38, 0.38, 0.03, panelMat, 0, ROOM_H - 0.015, -0.4, 40).castShadow = false;
  const ceilingLight = new THREE.PointLight(0xfff3df, 16, 9, 2); // REDISEÑO: ajustar intensidad aquí
  ceilingLight.position.set(0, ROOM_H - 0.35, -0.4);
  room.add(ceilingLight);

  // ---------- Zócalos ----------
  const baseMat = mat(0xffffff, 0.6);
  box(room, ROOM_W, 0.1, 0.03, baseMat, 0, 0.05, -ROOM_D / 2 + 0.015, 0, false);
  box(room, ROOM_W, 0.1, 0.03, baseMat, 0, 0.05, ROOM_D / 2 - 0.015, 0, false);
  box(room, 0.03, 0.1, ROOM_D, baseMat, -ROOM_W / 2 + 0.015, 0.05, 0, 0, false);
  box(room, 0.03, 0.1, ROOM_D, baseMat, ROOM_W / 2 - 0.015, 0.05, 0, 0, false);

  // ---------- Ventana (pared izquierda) con cielo, marco, cortinas ----------
  const WZ = -0.3, WY = 1.65, WW = 1.8, WH = 1.4, WX = -ROOM_W / 2;
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(WW, WH), new THREE.MeshBasicMaterial({ map: makeSkyTexture() }));
  sky.rotation.y = Math.PI / 2;
  sky.position.set(WX + 0.005, WY, WZ);
  room.add(sky);

  const frameMat = mat(0xffffff, 0.5);
  box(room, 0.1, 0.07, WW + 0.14, frameMat, WX + 0.05, WY + WH / 2 + 0.035, WZ, 0, false);
  box(room, 0.1, 0.07, WW + 0.14, frameMat, WX + 0.05, WY - WH / 2 - 0.035, WZ, 0, false);
  box(room, 0.1, WH, 0.07, frameMat, WX + 0.05, WY, WZ - WW / 2 - 0.035, 0, false);
  box(room, 0.1, WH, 0.07, frameMat, WX + 0.05, WY, WZ + WW / 2 + 0.035, 0, false);
  box(room, 0.06, WH, 0.03, frameMat, WX + 0.05, WY, WZ, 0, false);
  box(room, 0.06, 0.03, WW, frameMat, WX + 0.05, WY, WZ, 0, false);
  box(room, 0.2, 0.04, WW + 0.3, frameMat, WX + 0.1, WY - WH / 2 - 0.09, WZ, 0.01, false); // repisa

  const glass = new THREE.Mesh(new THREE.PlaneGeometry(WW, WH),
    new THREE.MeshStandardMaterial({ color: 0xdcecff, transparent: true, opacity: 0.1, roughness: 0.05, depthWrite: false }));
  glass.rotation.y = Math.PI / 2;
  glass.position.set(WX + 0.03, WY, WZ);
  room.add(glass);

  // Cortinas (tiras con pliegues) y barral
  const curtainMat = mat(0xe9e4da, 1);
  [-1, 1].forEach((s) => {
    for (let i = 0; i < 4; i++) {
      box(room, 0.06 + (i % 2) * 0.02, 2.55, 0.11, i % 2 ? mat(0xdcd5c8, 1) : curtainMat,
        WX + 0.12 + (i % 2) * 0.03, 1.4, WZ + s * (WW / 2 + 0.22 + i * 0.1), 0.02, false);
    }
  });
  cyl(room, 0.012, 0.012, 3.2, mat(0x2a3440, 0.4, 0.6), WX + 0.12, 2.72, WZ, 12).rotation.x = Math.PI / 2;

  // Luz de ventana (fría, de día)
  const windowLight = new THREE.PointLight(0xe4efff, 12, 8, 2);
  windowLight.position.set(WX + 0.7, 1.8, WZ);
  room.add(windowLight);

  // ---------- Puerta (pared derecha) ----------
  box(room, 0.05, 2.12, 1.0, mat(0xe4ddd1, 0.6), ROOM_W / 2 - 0.025, 1.06, 1.7, 0, false);
  box(room, 0.04, 2.05, 0.9, mat(0xf6f3ee, 0.5), ROOM_W / 2 - 0.05, 1.025, 1.7, 0.01, false);
  cyl(room, 0.012, 0.012, 0.12, mat(0xcfd6dc, 0.3, 0.8), ROOM_W / 2 - 0.1, 1.0, 1.4, 12).rotation.x = Math.PI / 2;

  // ---------- Alfombra bajo la cama ----------
  box(room, 2.9, 0.02, 2.7, mat(0xc7d2da, 1), BED.x + 0.15, 0.01, BED.z + 0.45, 0.01, false);
  box(room, 2.6, 0.022, 2.4, mat(0xa9bac7, 1), BED.x + 0.15, 0.011, BED.z + 0.45, 0.01, false);

  // ---------- CAMA ----------
  const bedGroup = new THREE.Group();
  room.add(bedGroup);
  const wood = mat(0x8a6a4f, 0.6);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) =>
    cyl(bedGroup, 0.035, 0.03, 0.12, wood, BED.x + sx * 0.78, 0.06, BED.z + sz * 1.0, 12));
  box(bedGroup, 1.68, 0.14, 2.16, wood, BED.x, 0.19, BED.z, 0.02);
  box(bedGroup, 1.6, 0.29, 2.1, mat(0xf3f5f7, 0.95), BED.x, 0.405, BED.z, 0.05);
  box(bedGroup, 1.8, 0.95, 0.07, mat(0x5f7285, 0.9), BED.x, 0.575, -ROOM_D / 2 + 0.035, 0.02); // cabecera tapizada
  box(bedGroup, 0.64, 0.14, 0.42, mat(0xffffff, 0.95), BED.x, BED.topY + 0.07, BED.z - 0.7, 0.05); // almohada (cabeza del paciente)
  box(bedGroup, 0.5, 0.12, 0.3, mat(0xb8cad8, 0.95), BED.x - 0.5, BED.topY + 0.06, BED.z - 0.88, 0.05); // cojín decorativo

  // ---------- Veladores ----------
  const nightstand = makeNightstand(NIGHTSTAND_R);   // lleva el equipo
  room.add(nightstand);
  room.add(makeNightstand(NIGHTSTAND_L));

  // Lámpara de noche (velador izquierdo)
  const lx = NIGHTSTAND_L.x, lz = NIGHTSTAND_L.z, ly = NIGHTSTAND_L.topY;
  cyl(room, 0.07, 0.07, 0.02, mat(0x2a3440, 0.4, 0.5), lx, ly + 0.01, lz);
  cyl(room, 0.012, 0.012, 0.24, mat(0x2a3440, 0.4, 0.5), lx, ly + 0.14, lz, 12);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.18, 32, 1, true),
    mat(0xf4e6cc, 0.9, 0, { emissive: 0xffd9a0, emissiveIntensity: 0.55, side: THREE.DoubleSide }));
  shade.position.set(lx, ly + 0.3, lz);
  room.add(shade);
  const lampLight = new THREE.PointLight(0xffc27a, 4, 3.5, 2);
  lampLight.position.set(lx, ly + 0.3, lz);
  room.add(lampLight);

  // ---------- Cuadro sobre la cama ----------
  box(room, 1.3, 0.8, 0.03, mat(0xffffff, 0.5), BED.x, 1.75, -ROOM_D / 2 + 0.02, 0.01, false);
  const art = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7), new THREE.MeshBasicMaterial({ map: makeArtTexture() }));
  art.position.set(BED.x, 1.75, -ROOM_D / 2 + 0.04);
  room.add(art);

  // ---------- Aparador (pared derecha) ----------
  const sbX = ROOM_W / 2 - 0.25;
  const walnut = mat(0x8a6a4f, 0.55);
  box(room, 0.45, 0.7, 1.6, walnut, sbX, 0.45, -0.5, 0.012);
  [-0.8, 0, 0.8].forEach((dz) => box(room, 0.01, 0.62, 0.02, mat(0x5e4630, 0.6), sbX - 0.226, 0.45, -0.5 + dz * 0.5, 0, false));
  [-0.4, 0.4].forEach((dz) => cyl(room, 0.012, 0.012, 0.03, mat(0xcfd6dc, 0.3, 0.8), sbX - 0.24, 0.55, -0.5 + dz, 12).rotation.z = Math.PI / 2);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) =>
    cyl(room, 0.02, 0.015, 0.1, walnut, sbX + sx * 0.16, 0.05, -0.5 + sz * 0.7, 12));
  const plant1 = makePlant(0.8); plant1.position.set(sbX, 0.8, -0.1); room.add(plant1);
  box(room, 0.18, 0.14, 0.26, mat(0xd7dde2, 0.7), sbX, 0.87, -1.05, 0.01);   // libros
  box(room, 0.16, 0.1, 0.24, mat(0x6f9fb8, 0.7), sbX, 0.99, -1.05, 0.01);

  // ---------- Sillón + planta de esquina ----------
  const armchair = makeArmchair();
  armchair.position.set(-2.6, 0, 1.2);
  armchair.rotation.y = Math.PI / 2;
  room.add(armchair);
  const plant2 = makePlant(1.5); plant2.position.set(-3.0, 0, 2.5); room.add(plant2);

  // Recorrer todo para sombras en mallas ya creadas
  room.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });

  return { bedGroup, nightstand };
}