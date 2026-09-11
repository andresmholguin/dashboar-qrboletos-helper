"""
Script de ejecución periódica para Instantánea de Ventas Semanal (Lunes 00:00 COT).
Puede ser ejecutado directamente por cron, el Programador de Tareas de Windows (Task Scheduler),
o como servicio en segundo plano.
"""
import urllib.request
import json
import datetime
import sys

def main():
    print(f"[{datetime.datetime.now().isoformat()}] Ejecutando comprobación de instantánea semanal...")
    url = "http://localhost:3001/api/reports/sales?forceRefresh=true"
    
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "QRBoletos-Weekly-Cron/1.0"})
        with urllib.request.urlopen(req, timeout=180) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data.get("success"):
                print(f"✅ Ventas actualizadas y analizadas: {data.get('totalEvents', 0)} eventos.")
                # Forzar toma de captura
                snap_req = urllib.request.Request(
                    "http://localhost:3001/api/reports/snapshots",
                    data=json.dumps({"action": "take_snapshot"}).encode("utf-8"),
                    headers={"Content-Type": "application/json"}
                )
                with urllib.request.urlopen(snap_req, timeout=30) as snap_resp:
                    snap_data = json.loads(snap_resp.read().decode("utf-8"))
                    print(f"📸 Instantánea guardada: {snap_data.get('snapshot', {}).get('label')}")
            else:
                print(f"❌ Error en respuesta de ventas: {data.get('error')}")
    except Exception as e:
        print(f"❌ Error al consultar la API de QRBoletos Helper: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
