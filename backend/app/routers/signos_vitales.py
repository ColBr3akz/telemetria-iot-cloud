# ============================================================
#  app/routers/signos_vitales.py
# ============================================================
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from app.crud import crear_signo_vital
from app.database import get_session
from app.models import SignosVitales
from app.schemas import SignosVitalesConAlerta, SignosVitalesCreate, SignosVitalesRead

router = APIRouter(prefix="/signos_vitales", tags=["Signos Vitales"])


@router.post("", response_model=SignosVitalesConAlerta, status_code=201)
def post_signo(payload: SignosVitalesCreate, session: Session = Depends(get_session)):
    try:
        signo, alerta = crear_signo_vital(session, payload)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"signo": signo, "alerta": alerta}


@router.get("", response_model=list[SignosVitalesRead])
def listar_signos(
    paciente_id: UUID | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    session: Session = Depends(get_session),
):
    stmt = (
        select(SignosVitales)
        .order_by(SignosVitales.fecha_registro.desc())
        .limit(limit)
    )
    if paciente_id:
        stmt = stmt.where(SignosVitales.paciente_id == paciente_id)
    return session.exec(stmt).all()


@router.get("/{signo_id}", response_model=SignosVitalesRead)
def obtener_signo(signo_id: UUID, session: Session = Depends(get_session)):
    signo = session.get(SignosVitales, signo_id)
    if not signo:
        raise HTTPException(404, "Signo vital no encontrado")
    return signo