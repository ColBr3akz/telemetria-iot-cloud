// REDISEÑO: medidas compartidas (1 unidad = 1 metro)
import * as THREE from "three";

export const ROOM = { W: 7, D: 6, H: 3 };           // x: -3.5..3.5 · z: -3..3

export const BED = { x: -0.8, z: -1.9, topY: 0.55, w: 1.6, l: 2.1 };

export const NIGHTSTAND_R = { x: 0.35, z: -2.7, topY: 0.52 };   // lleva el equipo
export const NIGHTSTAND_L = { x: -1.95, z: -2.7, topY: 0.52 };  // lleva la lámpara

// Posición de cada sensor en coordenadas LOCALES del paciente
export const SENSORS_LOCAL = {
  finger: new THREE.Vector3(0.273, 0.075, 0.19),
  axilla: new THREE.Vector3(0.187, 0.166, -0.40),
  chest: new THREE.Vector3(0.05, 0.25, -0.30),
};

export const patientToWorld = (v) =>
  new THREE.Vector3(BED.x + v.x, BED.topY + v.y, BED.z + v.z);