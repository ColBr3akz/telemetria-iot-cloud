# ============================================================
#  app/services/simulator.py
#  Simulación continua en background. Corre mientras el backend
#  esté vivo. Al iniciar, retoma desde la BD.
# ============================================================
import asyncio
import random
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from sqlmodel import Session, select

from app.crud import crear_signo_vital
from app.database import engine
from app.models import Alerta, Paciente
from app.schemas import SignosVitalesCreate

INTERVAL_SECONDS = 10
AUTO_RESOLVE_SECONDS = 90   # resolver alertas viejas cada 90s
TICK_LOG_EVERY = 3          # loggear cada 3 ticks (~30s)


@dataclass
class PacienteState:
    """Estado interno (no se persiste)."""
    health: float = field(default_factory=lambda: random.uniform(80, 95))
    trend: float = 0.0
    ticks_left: int = 0

    def tick(self) -> float:
        if self.ticks_left <= 0:
            r = random.random()
            if r < 0.06:  # 6% empeorar
                self.trend = -random.uniform(0.3, 0.6)
                self.ticks_left = random.randint(10, 20)
            elif r < 0.30:  # 24% mejorar (recovery bias)
                self.trend = random.uniform(0.5, 1.0)
                self.ticks_left = random.randint(12, 25)
            else:  # 70% estable
                self.trend = 0
                self.ticks_left = 1
        else:
            self.ticks_left -= 1

        self.health = max(
            55, min(100, self.health + self.trend + random.uniform(-0.15, 0.15))
        )
        return self.health

    def vitals(self) -> dict:
        """
        Mapea health → signos vitales por bandas determinísticas.
        Garantiza que solo en health < ~65 haya alertas.
        """
        if self.health >= 85:
            # Saludable
            spo2 = random.randint(96, 99)
            fc = random.randint(70, 85)
            fr = random.randint(14, 17)
            temp = round(random.uniform(36.4, 37.0), 1)
        elif self.health >= 70:
            # Limítrofe — normal pero cerca del umbral
            spo2 = random.randint(93, 96)
            fc = random.randint(82, 95)
            fr = random.randint(16, 19)
            temp = round(random.uniform(36.8, 37.5), 1)
        elif self.health >= 58:
            # Precaución — cruza algún umbral
            spo2 = random.randint(89, 93)
            fc = random.randint(96, 110)
            fr = random.randint(19, 23)
            temp = round(random.uniform(37.4, 38.0), 1)
        else:
            # Crítico
            spo2 = random.randint(82, 88)
            fc = random.randint(112, 130)
            fr = random.randint(23, 28)
            temp = round(random.uniform(38.0, 38.8), 1)

        return {
            "spo2": spo2,
            "frecuencia_cardiaca": fc,
            "frecuencia_respiratoria": fr,
            "temperatura": temp,
        }


class Simulator:
    def __init__(self, interval_seconds: int = INTERVAL_SECONDS):
        self.interval = interval_seconds
        self.states: dict[str, PacienteState] = {}
        self._task: asyncio.Task | None = None
        self._running = False

    async def start(self):
        if self._running:
            return
        self._running = True
        await asyncio.sleep(3)  # esperar a que lifespan termine
        try:
            await asyncio.to_thread(self._tick)
        except Exception as e:
            print(f"⚠️  [sim] primer tick falló: {e}")
        self._task = asyncio.create_task(self._loop())
        print(f"🤖 Simulador iniciado (cada {self.interval}s)")

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        print("🤖 Simulador detenido")

    async def _loop(self):
        tick_count = 0
        while self._running:
            await asyncio.sleep(self.interval)
            tick_count += 1
            try:
                n = await asyncio.to_thread(self._tick)
                if tick_count % TICK_LOG_EVERY == 0:
                    hora = datetime.now().strftime("%H:%M:%S")
                    print(f"🤖 [sim] tick #{tick_count} · {hora} · {n} signos")
                # Auto-resolver periódicamente
                if tick_count % max(1, AUTO_RESOLVE_SECONDS // self.interval) == 0:
                    await asyncio.to_thread(self._auto_resolve)
            except Exception as e:
                print(f"⚠️  [sim] tick #{tick_count} falló: {e}")

    def _tick(self) -> int:
        """Inserta un signo por paciente. Devuelve el número insertados OK."""
        with Session(engine) as session:
            pacientes = session.exec(
                select(Paciente).where(Paciente.activo == True)  # noqa: E712
            ).all()

        inserted = 0
        for p in pacientes:
            key = str(p.id)
            if key not in self.states:
                self.states[key] = PacienteState()
            state = self.states[key]
            state.tick()
            v = state.vitals()

            # Sesión nueva por paciente → si uno falla, los otros siguen
            with Session(engine) as session:
                try:
                    p_ref = session.get(Paciente, p.id)
                    if not p_ref:
                        continue
                    crear_signo_vital(
                        session,
                        SignosVitalesCreate(
                            paciente_id=p_ref.id,
                            equipo_id=p_ref.dispositivo_id,
                            origen="dispositivo",
                            **v,
                        ),
                        solo_si_no_hay_alerta=True,
                    )
                    inserted += 1
                except Exception as e:
                    session.rollback()
                    print(f"  ⚠️ [sim] {p.nombre[:20]}: {e}")

        return inserted

    def _auto_resolve(self):
        """Resuelve alertas con > 90s sin atender."""
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=AUTO_RESOLVE_SECONDS)
        with Session(engine) as session:
            stmt = select(Alerta).where(
                Alerta.resuelta == False,  # noqa: E712
                Alerta.fecha_creacion < cutoff,
            )
            viejas = session.exec(stmt).all()
            for a in viejas:
                a.resuelta = True
                a.fecha_resolucion = datetime.now(timezone.utc)
                session.add(a)
            if viejas:
                session.commit()
                print(f"🧹 [sim] {len(viejas)} alertas auto-resueltas")


simulator = Simulator()