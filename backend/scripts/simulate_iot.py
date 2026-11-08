# ============================================================
#  scripts/simulate_iot.py
#  Simula lecturas IoT en tiempo real cada 5s durante 1 minuto.
#  Inserta en Supabase vía API (respeta umbrales → alertas).
#
#  Uso (con uvicorn corriendo en :8000):
#    cd backend
#    .venv\Scripts\Activate.ps1
#    python scripts/simulate_iot.py
# ============================================================
import random
import sys
import time
from datetime import datetime

import httpx

API_BASE = "http://127.0.0.1:8000"
INTERVAL = 5          # segundos entre cada tanda
DURATION = 60         # 1 minuto (12 ticks × 5 pacientes = 60 lecturas nuevas)

# Perfiles clínicos de neumonía leve en seguimiento domiciliario.
# Cada perfil evoluciona suavemente para que la tendencia sea realista.
PERFILES = [
    # SpO2  FC   FR   Temp
    {"spo2": 95, "fc": 82, "fr": 18, "temp": 37.4},   # Camila  — estable
    {"spo2": 94, "fc": 88, "fr": 19, "temp": 37.6},   # Jheremy — leve
    {"spo2": 96, "fc": 78, "fr": 17, "temp": 37.2},   # Daniel  — estable
    {"spo2": 93, "fc": 94, "fr": 21, "temp": 37.9},   # María   — leve con pico
    {"spo2": 97, "fc": 74, "fr": 16, "temp": 36.9},   # Rodrigo — estable
]


def rango(valor, delta, decimales=0):
    v = valor + random.uniform(-delta, delta)
    return round(v, decimales) if decimales else int(v)


def generar_lectura(paciente, perfil):
    return {
        "paciente_id": paciente["id"],
        "equipo_id": paciente.get("dispositivo_id"),
        "spo2": max(85, min(100, rango(perfil["spo2"], 1.5))),
        "frecuencia_cardiaca": max(55, min(130, rango(perfil["fc"], 4))),
        "frecuencia_respiratoria": max(10, min(30, rango(perfil["fr"], 1))),
        "temperatura": round(
            max(36.0, min(39.5, perfil["temp"] + random.uniform(-0.2, 0.2))), 1
        ),
        "origen": "dispositivo",
    }


def evolucionar_perfil(perfil):
    # Drift lento: los valores no se quedan planos
    perfil["spo2"] = max(85, min(100, perfil["spo2"] + random.uniform(-0.4, 0.4)))
    perfil["fc"] = max(55, min(130, perfil["fc"] + random.uniform(-1.5, 1.5)))
    perfil["fr"] = max(10, min(30, perfil["fr"] + random.uniform(-0.4, 0.4)))
    perfil["temp"] = max(36.0, min(39.5, perfil["temp"] + random.uniform(-0.1, 0.1)))


def main():
    print("=" * 60)
    print("  SIMULADOR IoT — lecturas en tiempo real")
    print(f"  API:       {API_BASE}")
    print(f"  Intervalo: {INTERVAL}s   ·   Duración: {DURATION}s")
    print("=" * 60)

    with httpx.Client(timeout=10.0) as client:
        try:
            r = client.get(f"{API_BASE}/pacientes?activo=true")
            r.raise_for_status()
            pacientes = r.json()
        except Exception as e:
            print(f"❌ No se pudo conectar a la API: {e}")
            print("   ¿Arrancaste uvicorn? ¿Corriste el seed?")
            sys.exit(1)

        if not pacientes:
            print("❌ No hay pacientes en la BD. Corre scripts/seed_data.py primero.")
            sys.exit(1)

        print(f"🩺 Simulando {len(pacientes)} pacientes\n")

        perfiles = [p.copy() for p in PERFILES[: len(pacientes)]]
        while len(perfiles) < len(pacientes):
            perfiles.append({"spo2": 96, "fc": 75, "fr": 16, "temp": 36.9})

        inicio = time.time()
        tick = 0

        try:
            while True:
                if DURATION and (time.time() - inicio) > DURATION:
                    print(f"\n✅ Simulación completada ({tick} ticks)")
                    break

                tick += 1
                hora = datetime.now().strftime("%H:%M:%S")
                print(f"\n── tick {tick} · {hora} ──")

                for idx, paciente in enumerate(pacientes):
                    lectura = generar_lectura(paciente, perfiles[idx])
                    try:
                        resp = client.post(f"{API_BASE}/signos_vitales", json=lectura)
                        if resp.status_code in (200, 201):
                            data = resp.json()
                            alerta_txt = ""
                            if data.get("alerta"):
                                a = data["alerta"]
                                alerta_txt = f"  🚨 {a['tipo'].upper()}"
                            print(
                                f"  [{paciente['nombre'][:22]:<22}] "
                                f"SpO2={lectura['spo2']:>3} "
                                f"FC={lectura['frecuencia_cardiaca']:>3} "
                                f"FR={lectura['frecuencia_respiratoria']:>2} "
                                f"T={lectura['temperatura']:.1f}°C"
                                f"{alerta_txt}"
                            )
                            evolucionar_perfil(perfiles[idx])
                        else:
                            print(
                                f"  ⚠️  {paciente['nombre']}: HTTP {resp.status_code} "
                                f"{resp.text[:120]}"
                            )
                    except Exception as e:
                        print(f"  ❌ {paciente['nombre']}: {e}")

                time.sleep(INTERVAL)
        except KeyboardInterrupt:
            print("\n⏹️  Detenido por el usuario")


if __name__ == "__main__":
    main()