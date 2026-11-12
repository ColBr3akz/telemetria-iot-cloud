# ============================================================
#  app/services/slack_service.py
# ============================================================
import httpx
from app.config import settings

def enviar_alerta_slack(paciente_nombre: str, mensaje: str):
    """Envía un mensaje formateado a Slack si la URL está configurada."""
    if not settings.SLACK_WEBHOOK_URL:
        return

    emoji = "🚨"
    if "baja" in mensaje.lower() or "alta" in mensaje.lower():
        emoji = "⚠️"

    payload = {
        "text": f"{emoji} *ALERTA CLÍNICA*\n*Paciente:* {paciente_nombre}\n*Detalle:* {mensaje}"
    }

    try:
        # Usamos un timeout corto para no bloquear el backend
        with httpx.Client(timeout=5.0) as client:
            client.post(settings.SLACK_WEBHOOK_URL, json=payload)
    except Exception as e:
        print(f"⚠️ Error enviando a Slack: {e}")