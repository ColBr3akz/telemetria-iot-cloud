# ============================================================
#  app/crud.py
#  Operaciones de BD + lógica de negocio (umbrales → alertas).
# ============================================================
from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Session, select

from app.models import Alerta, Paciente, SignosVitales
from app.schemas import SignosVitalesCreate
from app.services.slack_service import enviar_alerta_slack


def evaluar_umbrales(paciente: Paciente, signo: SignosVitales) -> Optional[Alerta]:
    """Evalúa los signos vitales contra los umbrales del paciente."""
    u = paciente.umbrales or {}
    hallazgos: list[tuple[str, str]] = []

    # SpO2
    spo2_min = u.get("spo2", {}).get("min")
    if spo2_min is not None and signo.spo2 < spo2_min:
        sev = "rojo" if signo.spo2 < spo2_min - 5 else "naranja"
        hallazgos.append((sev, f"SpO2 en {signo.spo2}% (mín. {spo2_min}%)"))

    # FC
    fc_cfg = u.get("fc", {}) or {}
    fc_min, fc_max = fc_cfg.get("min"), fc_cfg.get("max")
    if fc_min is not None and signo.frecuencia_cardiaca < fc_min:
        hallazgos.append(("naranja", f"FC baja: {signo.frecuencia_cardiaca} bpm (mín. {fc_min})"))
    if fc_max is not None and signo.frecuencia_cardiaca > fc_max:
        hallazgos.append(("naranja", f"FC alta: {signo.frecuencia_cardiaca} bpm (máx. {fc_max})"))

    # FR
    fr_cfg = u.get("fr", {}) or {}
    fr_min, fr_max = fr_cfg.get("min"), fr_cfg.get("max")
    if fr_min is not None and signo.frecuencia_respiratoria < fr_min:
        hallazgos.append(("naranja", f"FR baja: {signo.frecuencia_respiratoria} rpm (mín. {fr_min})"))
    if fr_max is not None and signo.frecuencia_respiratoria > fr_max:
        hallazgos.append(("naranja", f"FR alta: {signo.frecuencia_respiratoria} rpm (máx. {fr_max})"))

    # Temp
    t_cfg = u.get("temperatura", {}) or {}
    t_min, t_max = t_cfg.get("min"), t_cfg.get("max")
    if t_min is not None and signo.temperatura < t_min:
        hallazgos.append(("naranja", f"Temperatura baja: {signo.temperatura}°C (mín. {t_min})"))
    if t_max is not None and signo.temperatura > t_max:
        sev = "rojo" if signo.temperatura > t_max + 1 else "naranja"
        hallazgos.append((sev, f"Fiebre: {signo.temperatura}°C (máx. {t_max})"))

    if not hallazgos:
        return None

    severidad_global = "rojo" if any(h[0] == "rojo" for h in hallazgos) else "naranja"
    mensaje = " | ".join(h[1] for h in hallazgos)
    return Alerta(paciente_id=paciente.id, tipo=severidad_global, mensaje=mensaje)


def crear_signo_vital(
    session: Session,
    payload: SignosVitalesCreate,
    solo_si_no_hay_alerta: bool = False,
) -> tuple[SignosVitales, Optional[Alerta]]:
    """
    Crea un signo vital. Genera alerta si está mal, o resuelve las existentes si ya está bien.
    """
    paciente = session.get(Paciente, payload.paciente_id)
    if not paciente:
        raise ValueError(f"Paciente {payload.paciente_id} no existe")

    signo = SignosVitales(**payload.model_dump())
    session.add(signo)
    session.flush()

    alerta = evaluar_umbrales(paciente, signo)

    # Dedupe
    if alerta and solo_si_no_hay_alerta:
        existente = session.exec(
            select(Alerta).where(
                Alerta.paciente_id == paciente.id,
                Alerta.resuelta == False,
            )
        ).first()
        if existente:
            alerta = None

    if alerta:
        session.add(alerta)
        if alerta.tipo == "rojo":
            enviar_alerta_slack(paciente.nombre, alerta.mensaje)
    else:
        # NUEVO: Si el paciente está BIEN, resolver automáticamente cualquier alerta activa previa
        alertas_activas = session.exec(
            select(Alerta).where(
                Alerta.paciente_id == paciente.id,
                Alerta.resuelta == False,
            )
        ).all()
        for a in alertas_activas:
            a.resuelta = True
            a.fecha_resolucion = datetime.now(timezone.utc)
            session.add(a)
            print(f"   ✅ Alerta resuelta automáticamente para {paciente.nombre}")

    paciente.ultima_medicion = signo.fecha_registro
    paciente.estado = alerta.tipo if alerta else ("naranja" if _tiene_alerta_activa(session, paciente) else "verde")
    session.add(paciente)

    session.commit()
    session.refresh(signo)
    if alerta:
        session.refresh(alerta)

    return signo, alerta


def _tiene_alerta_activa(session: Session, paciente: Paciente) -> bool:
    return (
        session.exec(
            select(Alerta).where(
                Alerta.paciente_id == paciente.id,
                Alerta.resuelta == False,
            )
        ).first()
        is not None
    )