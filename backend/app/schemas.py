# ============================================================
#  app/schemas.py
#  Schemas de entrada/salida para la API (Pydantic vía SQLModel).
# ============================================================
from datetime import datetime, date
from typing import Any, Optional
from uuid import UUID

from sqlmodel import SQLModel


# ---------- PACIENTES ----------
class PacienteCreate(SQLModel):
    nombre: str
    edad: int
    diagnostico: Optional[str] = None
    fecha_admision: Optional[date] = None
    medico_id: Optional[UUID] = None
    dispositivo_id: Optional[str] = None
    estado: str = "sin_equipo"
    datos_manuales_habilitados: bool = False
    tiene_equipo: bool = False
    equipo_encendido: bool = False
    activo: bool = True
    umbrales: Optional[dict[str, Any]] = None
    ultima_medicion: Optional[datetime] = None


class PacienteUpdate(SQLModel):
    nombre: Optional[str] = None
    edad: Optional[int] = None
    diagnostico: Optional[str] = None
    fecha_admision: Optional[date] = None
    medico_id: Optional[UUID] = None
    dispositivo_id: Optional[str] = None
    estado: Optional[str] = None
    datos_manuales_habilitados: Optional[bool] = None
    tiene_equipo: Optional[bool] = None
    equipo_encendido: Optional[bool] = None
    activo: Optional[bool] = None
    umbrales: Optional[dict[str, Any]] = None
    ultima_medicion: Optional[datetime] = None


class PacienteRead(SQLModel):
    id: UUID
    nombre: str
    edad: int
    diagnostico: Optional[str]
    fecha_admision: Optional[date]
    medico_id: Optional[UUID]
    dispositivo_id: Optional[str]
    estado: str
    datos_manuales_habilitados: bool
    tiene_equipo: bool
    equipo_encendido: bool
    activo: bool
    umbrales: dict[str, Any]
    ultima_medicion: Optional[datetime]
    fecha_registro: datetime


# ---------- SIGNOS VITALES ----------
class SignosVitalesCreate(SQLModel):
    paciente_id: UUID
    equipo_id: Optional[str] = None
    spo2: int
    frecuencia_cardiaca: int
    frecuencia_respiratoria: int
    temperatura: float
    origen: str = "dispositivo"


class SignosVitalesRead(SQLModel):
    id: UUID
    paciente_id: UUID
    equipo_id: Optional[str]
    spo2: int
    frecuencia_cardiaca: int
    frecuencia_respiratoria: int
    temperatura: float
    origen: str
    fecha_registro: datetime


class SignosVitalesConAlerta(SQLModel):
    signo: SignosVitalesRead
    alerta: Optional["AlertaRead"] = None


# ---------- ALERTAS ----------
class AlertaRead(SQLModel):
    id: UUID
    paciente_id: UUID
    tipo: str
    mensaje: str
    resuelta: bool
    fecha_creacion: datetime
    fecha_resolucion: Optional[datetime]