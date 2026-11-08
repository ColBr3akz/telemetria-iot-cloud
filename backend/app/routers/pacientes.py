# ============================================================
#  app/routers/pacientes.py
# ============================================================
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from app.database import get_session
from app.models import Paciente
from app.schemas import PacienteCreate, PacienteRead, PacienteUpdate

router = APIRouter(prefix="/pacientes", tags=["Pacientes"])


@router.post("", response_model=PacienteRead, status_code=201)
def crear_paciente(payload: PacienteCreate, session: Session = Depends(get_session)):
    data = payload.model_dump(exclude_unset=True)
    if data.get("umbrales") is None:
        data.pop("umbrales", None)
    paciente = Paciente(**data)
    session.add(paciente)
    session.commit()
    session.refresh(paciente)
    return paciente


@router.get("", response_model=list[PacienteRead])
def listar_pacientes(
    activo: bool | None = Query(default=None),
    session: Session = Depends(get_session),
):
    stmt = select(Paciente).order_by(Paciente.fecha_registro.desc())
    if activo is not None:
        stmt = stmt.where(Paciente.activo == activo)
    return session.exec(stmt).all()


@router.get("/{paciente_id}", response_model=PacienteRead)
def obtener_paciente(paciente_id: UUID, session: Session = Depends(get_session)):
    paciente = session.get(Paciente, paciente_id)
    if not paciente:
        raise HTTPException(404, "Paciente no encontrado")
    return paciente


@router.patch("/{paciente_id}", response_model=PacienteRead)
def actualizar_paciente(
    paciente_id: UUID,
    payload: PacienteUpdate,
    session: Session = Depends(get_session),
):
    paciente = session.get(Paciente, paciente_id)
    if not paciente:
        raise HTTPException(404, "Paciente no encontrado")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(paciente, key, value)
    session.add(paciente)
    session.commit()
    session.refresh(paciente)
    return paciente


@router.delete("/{paciente_id}", status_code=204)
def eliminar_paciente(paciente_id: UUID, session: Session = Depends(get_session)):
    paciente = session.get(Paciente, paciente_id)
    if not paciente:
        raise HTTPException(404, "Paciente no encontrado")
    session.delete(paciente)
    session.commit()
    return None