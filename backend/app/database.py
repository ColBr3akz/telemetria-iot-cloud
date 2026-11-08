# ============================================================
#  app/database.py
#  Conexión a Supabase (PostgreSQL) usando SQLModel
# ============================================================
from sqlmodel import SQLModel, Session, create_engine

from app.config import settings

# El engine maneja el pool de conexiones.
# - pool_pre_ping=True evita errores por conexiones inactivas (crítico con Supabase Pooler).
# - pool_recycle=300 recicla conexiones cada 5 min.
engine = create_engine(
    settings.DATABASE_URL,
    echo=(settings.API_ENV == "dev"),  # logs SQL solo en desarrollo
    pool_pre_ping=True,
    pool_recycle=300,
)


def get_session():
    """Dependency de FastAPI: entrega una sesión por request."""
    with Session(engine) as session:
        yield session


def init_db():
    """Crea las tablas si no existen (en Supabase ya están por schema.sql)."""
    SQLModel.metadata.create_all(engine)