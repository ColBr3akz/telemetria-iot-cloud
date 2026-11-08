# ============================================================
#  scripts/seed_data.py
#  Datos de prueba con nombres reales y casos clínicos de
#  neumonía leve en seguimiento domiciliario.
#
#  Uso:
#    cd backend
#    .venv\Scripts\Activate.ps1
#    python scripts/seed_data.py
# ============================================================
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlmodel import Session, select  # noqa: E402

from app.crud import crear_signo_vital  # noqa: E402
from app.database import engine  # noqa: E402
from app.models import Alerta, Paciente  # noqa: E402
from app.schemas import SignosVitalesCreate  # noqa: E402


PACIENTES_DEMO = [
    {
        "nombre": "Camila Dulon Antezana",
        "edad": 23,
        "diagnostico": "Neumonía leve adquirida en la comunidad",
        "dispositivo_id": "RPI5-001",
    },
    {
        "nombre": "Jheremy Vallejos Escobar",
        "edad": 37,
        "diagnostico": "Neumonía viral en resolución",
        "dispositivo_id": "RPI5-002",
    },
    {
        "nombre": "Daniel Fernando Palma",
        "edad": 22,
        "diagnostico": "Neumonía bacteriana leve",
        "dispositivo_id": "RPI5-003",
    },
    {
        "nombre": "María Fernanda Calvi Rodriguez",
        "edad": 29,
        "diagnostico": "Neumonía atípica leve",
        "dispositivo_id": "RPI5-004",
    },
    {
        "nombre": "Rodrigo Andrés Torrico Vargas",
        "edad": 51,
        "diagnostico": "Neumonía leve post-operatoria",
        "dispositivo_id": "RPI5-005",
    },
]


def limpiar_datos(session: Session) -> None:
    for alerta in session.exec(select(Alerta)).all():
        session.delete(alerta)
    session.commit()
    for paciente in session.exec(select(Paciente)).all():
        session.delete(paciente)
    session.commit()
    print("🧹 Datos anteriores eliminados")


def crear_pacientes(session: Session) -> list[Paciente]:
    pacientes: list[Paciente] = []
    for p in PACIENTES_DEMO:
        paciente = Paciente(
            nombre=p["nombre"],
            edad=p["edad"],
            diagnostico=p["diagnostico"],
            dispositivo_id=p["dispositivo_id"],
            estado="verde",
            tiene_equipo=True,
            equipo_encendido=True,
            activo=True,
        )
        session.add(paciente)
        pacientes.append(paciente)
    session.commit()
    for p in pacientes:
        session.refresh(p)
    print(f"👥 {len(pacientes)} pacientes creados")
    return pacientes


def generar_signos(session: Session, pacientes: list[Paciente]) -> None:
    total_signos = 0
    total_alertas = 0

    for paciente in pacientes:
        ahora = datetime.now(timezone.utc)
        # Perfil base de neumonía leve: valores estables con algún pico ocasional
        for i in range(10):
            critico = random.random() < 0.15  # 15% cruza umbrales

            if critico:
                spo2 = random.randint(88, 91)
                fc = random.choice([random.randint(100, 112), random.randint(58, 62)])
                fr = random.choice([random.randint(21, 24), random.randint(10, 11)])
                temp = round(random.uniform(38.1, 38.8), 1)
            else:
                spo2 = random.randint(93, 97)
                fc = random.randint(72, 92)
                fr = random.randint(15, 20)
                temp = round(random.uniform(36.8, 37.8), 1)

            payload = SignosVitalesCreate(
                paciente_id=paciente.id,
                equipo_id=paciente.dispositivo_id,
                spo2=spo2,
                frecuencia_cardiaca=fc,
                frecuencia_respiratoria=fr,
                temperatura=temp,
                origen="dispositivo",
            )

            try:
                signo, alerta = crear_signo_vital(session, payload)
                total_signos += 1
                if alerta:
                    total_alertas += 1
                signo.fecha_registro = ahora - timedelta(minutes=30 * i)
                session.add(signo)
                session.commit()
            except Exception as e:
                session.rollback()
                print(f"  ⚠️  Error en paciente {paciente.nombre}: {e}")

    print(f"📊 {total_signos} signos vitales generados")
    print(f"🚨 {total_alertas} alertas disparadas automáticamente")


def main() -> None:
    print("=" * 60)
    print("  SEED — Datos clínicos de prueba")
    print("=" * 60)

    with Session(engine) as session:
        limpiar_datos(session)
        pacientes = crear_pacientes(session)
        generar_signos(session, pacientes)

    print("\n✅ Seed completado. Verifica en Supabase → Table Editor")
    print("   o abre http://127.0.0.1:8000/docs para probar los endpoints.")


if __name__ == "__main__":
    main()