# ============================================================
#  app/routers/alertas.py
# ============================================================
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from app.database import get_session
from app.models import Alerta
from app.schemas import AlertaRead

router = APIRouter(prefix="/alertas", tags=["Alertas"])


@router.get("", response_model=list[AlertaRead])
def listar_alertas(
    resuelta: bool | None = Query(default=None),
    paciente_id: UUID | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    session: Session = Depends(get_session),
):
    stmt = select(Alerta).order_by(Alerta.fecha_creacion.desc()).limit(limit)
    if resuelta is not None:
        stmt = stmt.where(Alerta.resuelta == resuelta)
    if paciente_id:
        stmt = stmt.where(Alerta.paciente_id == paciente_id)
    return session.exec(stmt).all()


@router.get("/{alerta_id}", response_model=AlertaRead)
def obtener_alerta(alerta_id: UUID, session: Session = Depends(get_session)):
    alerta = session.get(Alerta, alerta_id)
    if not alerta:
        raise HTTPException(404, "Alerta no encontrada")
    return alerta


@router.patch("/{alerta_id}/resolver", response_model=AlertaRead)
def resolver_alerta(alerta_id: UUID, session: Session = Depends(get_session)):
    alerta = session.get(Alerta, alerta_id)
    if not alerta:
        raise HTTPException(404, "Alerta no encontrada")
    if alerta.resuelta:
        raise HTTPException(400, "La alerta ya está resuelta")
    alerta.resuelta = True
    alerta.fecha_resolucion = datetime.now(timezone.utc)
    session.add(alerta)
    session.commit()
    session.refresh(alerta)
    return alerta