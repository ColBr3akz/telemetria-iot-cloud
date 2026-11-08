# ============================================================
#  app/main.py
# ============================================================
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlmodel import Session

from app.config import settings
from app.database import engine
from app.routers import alertas, pacientes, signos_vitales
from app.services.simulator import simulator


@asynccontextmanager
async def lifespan(app: FastAPI):
    await simulator.start()
    yield
    await simulator.stop()


app = FastAPI(
    title="Telemetría IoT — API",
    description=(
        "API REST para el monitoreo domiciliario post-alta de pacientes con "
        "insuficiencia respiratoria. Reimplementación paralela del dominio "
        "en Supabase + FastAPI (proyecto de tesis intacto en Firebase)."
    ),
    version="0.3.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(pacientes.router)
app.include_router(signos_vitales.router)
app.include_router(alertas.router)


@app.get("/health", tags=["Sistema"])
def health():
    db_ok, db_version, db_error = False, None, None
    try:
        with Session(engine) as session:
            result = session.exec(text("SELECT version();")).first()
            db_version = result[0] if result else None
            db_ok = True
    except Exception as e:
        db_error = str(e)
    return {
        "status": "ok" if db_ok else "degraded",
        "api": {"env": settings.API_ENV, "version": app.version},
        "database": {"connected": db_ok, "version": db_version, "error": db_error},
        "simulator": {"running": simulator._running},
    }


@app.get("/", tags=["Sistema"])
def root():
    return {
        "mensaje": "Telemetría IoT — API FastAPI",
        "docs": "/docs",
        "health": "/health",
    }