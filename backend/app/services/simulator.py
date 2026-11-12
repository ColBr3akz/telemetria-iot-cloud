# ============================================================
#  app/services/simulator.py
#  Simulación controlada: 1 paciente en crisis cada 2 minutos.
#  La crisis dura 1 minuto y luego se recupera.
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
AUTO_RESOLVE_SECONDS = 90
TICK_LOG_EVERY = 6

# Control de la simulación
CRISIS_INTERVAL_TICKS = 12   # Cada 12 ticks (12 * 10s = 2 minutos) ocurre una crisis
CRISIS_DURATION_TICKS = 6    # La crisis dura 6 ticks (6 * 10s = 1 minuto)


@dataclass
class PacienteState:
    health: float = field(default_factory=lambda: random.uniform(85, 95))
    trend: float = 0.0
    ticks_left: int = 0
    in_crisis: bool = False
    crisis_ticks_left: int = 0

    def tick(self) -> float:
        # Lógica si el paciente está en crisis
        if self.in_crisis:
            self.crisis_ticks_left -= 1
            if self.crisis_ticks_left <= 0:
                # Se acaba la crisis, se recupera de golpe
                self.in_crisis = False
                self.health = random.uniform(85, 95)
                print(f"   ✅ Paciente recuperado. Volviendo a estado estable.")
            else:
                # Mantenerse crítico durante el minuto de crisis
                self.health = 45.0
            return self.health

        # Lógica normal (sin crisis)
        if self.ticks_left <= 0:
            r = random.random()
            if r < 0.05:
                self.trend = -random.uniform(0.3, 0.6)
                self.ticks_left = random.randint(10, 20)
            elif r < 0.30:
                self.trend = random.uniform(0.5, 1.0)
                self.ticks_left = random.randint(12, 25)
            else:
                self.trend = 0
                self.ticks_left = 1
        else:
            self.ticks_left -= 1

        self.health = max(60, min(100, self.health + self.trend + random.uniform(-0.15, 0.15)))
        return self.health

    def vitals(self) -> dict:
        if self.health >= 85:
            spo2 = random.randint(96, 99)
            fc = random.randint(70, 85)
            fr = random.randint(14, 17)
            temp = round(random.uniform(36.4, 37.0), 1)
        elif self.health >= 70:
            spo2 = random.randint(93, 96)
            fc = random.randint(82, 95)
            fr = random.randint(16, 19)
            temp = round(random.uniform(36.8, 37.5), 1)
        elif self.health >= 58:
            spo2 = random.randint(88, 92)
            fc = random.randint(96, 110)
            fr = random.randint(19, 23)
            temp = round(random.uniform(37.4, 38.0), 1)
        else:
            # Valores críticos
            spo2 = random.randint(80, 86)
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
        self.tick_count = 0

    async def start(self):
        if self._running:
            return
        self._running = True
        await asyncio.sleep(3)
        try:
            await asyncio.to_thread(self._tick)
        except Exception as e:
            print(f"⚠️  [sim] primer tick falló: {e}")
        self._task = asyncio.create_task(self._loop())
        print(f"🤖 Simulador iniciado. Crisis cada {CRISIS_INTERVAL_TICKS * self.interval}s, dura {CRISIS_DURATION_TICKS * self.interval}s.")

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _loop(self):
        while self._running:
            await asyncio.sleep(self.interval)
            self.tick_count += 1
            try:
                n = await asyncio.to_thread(self._tick)
                if self.tick_count % TICK_LOG_EVERY == 0:
                    hora = datetime.now().strftime("%H:%M:%S")
                    print(f"🤖 [sim] tick #{self.tick_count} · {hora} · {n} signos")
                
                if self.tick_count % max(1, AUTO_RESOLVE_SECONDS // self.interval) == 0:
                    await asyncio.to_thread(self._auto_resolve)
            except Exception as e:
                print(f"⚠️  [sim] tick #{self.tick_count} falló: {e}")

    def _tick(self) -> int:
        with Session(engine) as session:
            pacientes = session.exec(select(Paciente).where(Paciente.activo == True)).all()

        # Verificar si hay algun paciente en crisis actualmente
        crisis_en_curso = any(state.in_crisis for state in self.states.values())

        # Condición para iniciar una nueva crisis (tiempo cumplido y nadie en crisis)
        if self.tick_count > 0 and self.tick_count % CRISIS_INTERVAL_TICKS == 0 and not crisis_en_curso:
            paciente_afectado = random.choice(pacientes)
            key_afectado = str(paciente_afectado.id)
            
            if key_afectado not in self.states:
                self.states[key_afectado] = PacienteState()
            
            # Inyectar crisis
            self.states[key_afectado].in_crisis = True
            self.states[key_afectado].crisis_ticks_left = CRISIS_DURATION_TICKS
            print(f"\n🚨 [sim] ¡EVENTO DE CRISIS! {paciente_afectado.nombre} ha empeorado de repente.\n")

        inserted = 0
        for p in pacientes:
            key = str(p.id)
            if key not in self.states:
                self.states[key] = PacienteState()
            
            state = self.states[key]
            state.tick()
            v = state.vitals()

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
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=AUTO_RESOLVE_SECONDS)
        with Session(engine) as session:
            stmt = select(Alerta).where(Alerta.resuelta == False, Alerta.fecha_creacion < cutoff)
            viejas = session.exec(stmt).all()
            for a in viejas:
                a.resuelta = True
                a.fecha_resolucion = datetime.now(timezone.utc)
                session.add(a)
            if viejas:
                session.commit()
                print(f"🧹 [sim] {len(viejas)} alertas auto-resueltas")


simulator = Simulator()