# ============================================================
#  app/routers/ai.py
# ============================================================
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from app.database import get_session
from app.models import Paciente, SignosVitales
from app.config import settings

router = APIRouter(prefix="/ai", tags=["Inteligencia Artificial"])

@router.post("/resumen/{paciente_id}")
def generar_resumen(paciente_id: UUID, session: Session = Depends(get_session)):
    paciente = session.get(Paciente, paciente_id)
    if not paciente:
        raise HTTPException(404, "Paciente no encontrado")

    # Obtener el último signo vital
    stmt = select(SignosVitales).where(SignosVitales.paciente_id == paciente_id).order_by(SignosVitales.fecha_registro.desc()).limit(1)
    signo = session.exec(stmt).first()

    if not signo:
        return {"resumen": "No hay signos vitales registrados para este paciente."}

    # Lógica del resumen (Simulando a Astra/ChatGPT)
    # Si tuvieras una API Key real de OpenAI, aquí harías la petición HTTP.
    # Por ahora, generamos un análisis clínico basado en reglas.
    
    estado_clinico = "estable"
    if paciente.estado == "rojo":
        estado_clinico = "crítico"
    elif paciente.estado == "naranja":
        estado_clinico = "de precaución"

    resumen = (
        f"El paciente {paciente.nombre} se encuentra en estado {estado_clinico.upper()}. "
        f"Sus últimos signos registrados son: SpO2 {signo.spo2}%, "
        f"Frecuencia cardíaca {signo.frecuencia_cardiaca} bpm, "
        f"Frecuencia respiratoria {signo.frecuencia_respiratoria} rpm, "
        f"Temperatura {signo.temperatura}°C. "
    )

    if paciente.estado == "rojo":
        resumen += "Se recomienda intervención médica inmediata."
    elif paciente.estado == "naranja":
        resumen += "Se sugiere mantener en observación constante."
    else:
        resumen += "Los valores se mantienen dentro de los umbrales normales."

    return {"resumen": resumen}