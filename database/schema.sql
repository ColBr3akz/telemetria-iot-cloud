-- =============================================================
-- PROYECTO: Telemetría IoT — Monitoreo Domiciliario Post-Alta
-- MÓDULO:  Reimplementación paralela (Supabase/PostgreSQL)
-- DESC:    DDL de las 3 tablas del dominio
--          (pacientes · signos_vitales · alertas)
-- =============================================================

-- -------------------------------------------------------------
-- 0. Extensiones
-- -------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid()

-- -------------------------------------------------------------
-- 1. TABLA: pacientes
--    Entidad maestra. Un paciente puede tener N mediciones y
--    N alertas. Umbrales en JSONB (mismo patrón que Firestore).
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pacientes (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre                      TEXT NOT NULL,
    edad                        INTEGER NOT NULL
                                CHECK (edad BETWEEN 0 AND 120),
    diagnostico                 TEXT,
    fecha_admision              DATE,
    medico_id                   UUID,
    dispositivo_id              TEXT UNIQUE,
    estado                      TEXT NOT NULL DEFAULT 'sin_equipo'
                                CHECK (estado IN ('verde','naranja','rojo','sin_equipo')),
    datos_manuales_habilitados  BOOLEAN NOT NULL DEFAULT FALSE,
    tiene_equipo                BOOLEAN NOT NULL DEFAULT FALSE,
    equipo_encendido            BOOLEAN NOT NULL DEFAULT FALSE,
    activo                      BOOLEAN NOT NULL DEFAULT TRUE,
    umbrales                    JSONB NOT NULL DEFAULT '{
        "spo2":        {"min": 90},
        "fc":          {"min": 60, "max": 100},
        "fr":          {"min": 12, "max": 20},
        "temperatura": {"min": 36.0, "max": 38.0}
    }'::jsonb,
    ultima_medicion             TIMESTAMPTZ,
    fecha_registro              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------
-- 2. TABLA: signos_vitales
--    Transaccional. Cada fila = una medición.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS signos_vitales (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id               UUID NOT NULL
                              REFERENCES pacientes(id) ON DELETE CASCADE,
    equipo_id                 TEXT,
    spo2                      INTEGER NOT NULL
                              CHECK (spo2 BETWEEN 0 AND 100),
    frecuencia_cardiaca       INTEGER NOT NULL
                              CHECK (frecuencia_cardiaca BETWEEN 0 AND 300),
    frecuencia_respiratoria   INTEGER NOT NULL
                              CHECK (frecuencia_respiratoria BETWEEN 0 AND 100),
    temperatura               NUMERIC(4,2) NOT NULL
                              CHECK (temperatura BETWEEN 30.0 AND 45.0),
    origen                    TEXT NOT NULL
                              CHECK (origen IN ('dispositivo','manual')),
    fecha_registro            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------
-- 3. TABLA: alertas
--    Evento. tipo='rojo' → crítico, tipo='naranja' → precaución.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alertas (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id         UUID NOT NULL
                        REFERENCES pacientes(id) ON DELETE CASCADE,
    tipo                TEXT NOT NULL
                        CHECK (tipo IN ('rojo','naranja')),
    mensaje             TEXT NOT NULL,
    resuelta            BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_creacion      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fecha_resolucion    TIMESTAMPTZ
);

-- -------------------------------------------------------------
-- 4. ÍNDICES (dashboard e historial)
-- -------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_signos_paciente_fecha
    ON signos_vitales (paciente_id, fecha_registro DESC);

CREATE INDEX IF NOT EXISTS idx_signos_fecha
    ON signos_vitales (fecha_registro DESC);

CREATE INDEX IF NOT EXISTS idx_alertas_paciente_resuelta
    ON alertas (paciente_id, resuelta);

CREATE INDEX IF NOT EXISTS idx_alertas_fecha
    ON alertas (fecha_creacion DESC);

CREATE INDEX IF NOT EXISTS idx_pacientes_activo
    ON pacientes (activo) WHERE activo = TRUE;

CREATE INDEX IF NOT EXISTS idx_pacientes_medico
    ON pacientes (medico_id);

-- -------------------------------------------------------------
-- 5. COMENTARIOS (documentación interna)
-- -------------------------------------------------------------
COMMENT ON TABLE  pacientes       IS 'Pacientes del programa de monitoreo domiciliario post-alta';
COMMENT ON TABLE  signos_vitales  IS 'Mediciones de signos vitales (IoT o manuales)';
COMMENT ON TABLE  alertas         IS 'Alertas disparadas por cruce de umbrales clínicos';

COMMENT ON COLUMN pacientes.umbrales        IS 'Umbrales clínicos: {spo2:{min},fc:{min,max},fr:{min,max},temperatura:{min,max}}';
COMMENT ON COLUMN pacientes.ultima_medicion IS 'Cache denormalizada de la última medición';
COMMENT ON COLUMN signos_vitales.origen     IS 'dispositivo | manual';
COMMENT ON COLUMN alertas.tipo              IS 'rojo (crítico) | naranja (precaución)';