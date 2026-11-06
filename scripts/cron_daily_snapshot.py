#!/usr/bin/env python3
"""
cron_daily_snapshot.py
Ejecución periódica diaria para Instantánea de Ventas Diaria (06:00 AM COT).
Almacena el estado de ventas de los eventos activos y mantiene el último reporte por día.
"""
import sys
import os
import json
import time
import datetime
import urllib.request
import urllib.error
import subprocess

PORTS_TO_TRY = [3001, 3000, 3002]

def log(msg):
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    formatted = f"[{timestamp}] {msg}"
    print(formatted, flush=True)
    
    scratch_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scratch")
    try:
        os.makedirs(scratch_dir, exist_ok=True)
        log_file = os.path.join(scratch_dir, "cron_snapshot.log")
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(formatted + "\n")
    except Exception:
        pass

def find_active_server_port():
    for port in PORTS_TO_TRY:
        try:
            url = f"http://localhost:{port}/api/reports/snapshots"
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=4) as resp:
                if resp.status == 200:
                    return port
        except Exception:
            continue
    return None

def ensure_server_running():
    port = find_active_server_port()
    if port:
        return port

    log("⚠️ Servidor Next.js no detectado. Iniciando en segundo plano en puerto 3001...")
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    try:
        cmd = ["cmd.exe", "/c", "npm run dev -- -p 3001"]
        subprocess.Popen(cmd, cwd=root_dir, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        log("Esperando inicio del servidor local...")
        for _ in range(15):
            time.sleep(2)
            port = find_active_server_port()
            if port:
                log(f"✅ Servidor detectado en puerto {port}.")
                return port
    except Exception as e:
        log(f"Aviso intentando iniciar servidor: {e}")

    return 3001

def main():
    log("=======================================================")
    log("🚀 Iniciando actualización automática de ventas diaria (06:00 AM)...")

    port = ensure_server_running()
    base_url = f"http://localhost:{port}"

    sales_url = f"{base_url}/api/reports/sales?forceRefresh=true"
    log(f"Disparando extracción en {sales_url}...")

    sales_data = None
    snapshot_meta = None

    try:
        req = urllib.request.Request(
            sales_url,
            headers={"User-Agent": "QRBoletos-Daily-Cron/1.0"}
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            res_json = json.loads(resp.read().decode("utf-8"))
            
            if res_json.get("status") == "scraping" or res_json.get("success"):
                log("⏳ Extracción en curso en Google Chrome vía CDP. Esperando finalización...")
                
                # Sondear el estado cada 3 segundos hasta un máximo de 120 segundos
                for poll_step in range(40):
                    time.sleep(3)
                    status_url = f"{base_url}/api/reports/sales?status=true"
                    try:
                        req_s = urllib.request.Request(status_url, headers={"User-Agent": "QRBoletos-Daily-Cron/1.0"})
                        with urllib.request.urlopen(req_s, timeout=10) as s_resp:
                            s_json = json.loads(s_resp.read().decode("utf-8"))
                            status = s_json.get("status")
                            
                            if status == "completed":
                                sales_data = s_json.get("salesData", [])
                                snapshot_meta = {
                                    "id": s_json.get("snapshotId"),
                                    "label": s_json.get("snapshotLabel")
                                }
                                log(f"✅ Extracción finalizada con éxito: {len(sales_data)} eventos extraídos.")
                                log(f"📸 Snapshot guardado: {snapshot_meta.get('label')} (ID: {snapshot_meta.get('id')})")
                                break
                            elif status == "error":
                                log(f"❌ Error en la extracción de Chrome: {s_json.get('error')}")
                                sys.exit(1)
                            else:
                                elapsed = s_json.get("elapsedSeconds", (poll_step + 1) * 3)
                                log(f"   ... extrayendo ventas ({elapsed}s)")
                    except Exception as poll_err:
                        log(f"   ... esperando respuesta ({poll_err})")
            else:
                log(f"❌ Respuesta inicial no exitosa: {res_json.get('error')}")
                sys.exit(1)
    except Exception as e:
        log(f"❌ Error conectando con la API de ventas: {e}")
        sys.exit(1)

    if not sales_data:
        log("❌ No se recibieron datos de ventas tras el sondeo. Verifica que Google Chrome esté abierto en puerto 9222.")
        sys.exit(1)

    log("🎉 Actualización automática completada exitosamente a las 06:00 AM.")
    log("=======================================================")

if __name__ == "__main__":
    main()
