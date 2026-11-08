# ============================================================
#  app/models.py  (compatible con TIMESTAMPTZ de Supabase)
# ============================================================
from datetime import datetime, date, timezone
from typing import Any, Optional
from uuid import UUID, uuid4

from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    """Fecha actual con zona horaria UTC (requerido por TIMESTAMPTZ)."""
    return datetime.now(timezone.utc)


class Paciente(SQLModel, table=True):
    __tablename__ = "pacientes"

    id: Optional[UUID] = Field(default_factory=uuid4, primary_key=True)
    nombre: str
    edad: int
    diagnostico: Optional[str] = None
    fecha_admision: Optional[date] = None
    medico_id: Optional[UUID] = None
    dispositivo_id: Optional[str] = None
    estado: str = Field(default="sin_equipo")
    datos_manuales_habilitados: bool = Field(default=False)
    tiene_equipo: bool = Field(default=False)
    equipo_encendido: bool = Field(default=False)
    activo: bool = Field(default=True)
    umbrales: dict[str, Any] = Field(
        default_factory=lambda: {
            "spo2": {"min": 90},
            "fc": {"min": 60, "max": 100},
            "fr": {"min": 12, "max": 20},
            "temperatura": {"min": 36.0, "max": 38.0},
        },
        sa_column=Column(JSONB, nullable=False),
    )
    ultima_medicion: Optional[datetime] = None
    fecha_registro: datetime = Field(default_factory=utcnow)


class SignosVitales(SQLModel, table=True):
    __tablename__ = "signos_vitales"

    id: Optional[UUID] = Field(default_factory=uuid4, primary_key=True)
    paciente_id: UUID = Field(foreign_key="pacientes.id", index=True)
    equipo_id: Optional[str] = None
    spo2: int
    frecuencia_cardiaca: int
    frecuencia_respiratoria: int
    temperatura: float
    origen: str = Field(default="dispositivo")
    fecha_registro: datetime = Field(default_factory=utcnow)


class Alerta(SQLModel, table=True):
    __tablename__ = "alertas"

    id: Optional[UUID] = Field(default_factory=uuid4, primary_key=True)
    paciente_id: UUID = Field(foreign_key="pacientes.id", index=True)
    tipo: str
    mensaje: str
    resuelta: bool = Field(default=False)
    fecha_creacion: datetime = Field(default_factory=utcnow)
    fecha_resolucion: Optional[datetime] = None