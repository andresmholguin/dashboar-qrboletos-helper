#!/usr/bin/env python3
"""
cron_daily_snapshot.py
Ejecución periódica diaria para Instantánea de Ventas Diaria (00:00 COT).
Almacena el estado de ventas de los eventos activos y mantiene una retención móvil de 7 días.
"""
import sys
import os
import json
import time
import datetime
import urllib.request
import urllib.error

PORTS_TO_TRY = [3001, 3000, 3002]

def log(msg):
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    formatted = f"[{timestamp}] {msg}"
    print(formatted, flush=True)
    
    # Escribir log a scratch/cron_snapshot.log
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

def main():
    log("=======================================================")
    log("🚀 Iniciando captura automática de snapshot diario (00:00 COT)...")

    port = find_active_server_port()
    if not port:
        log("⚠️ Servidor Next.js no detectado en puertos 3001, 3000 o 3002.")
        log("💡 Intentando consultar puerto por defecto 3001...")
        port = 3001

    base_url = f"http://localhost:{port}"

    # 1. Forzar refresco y captura de ventas en vivo
    sales_url = f"{base_url}/api/reports/sales?forceRefresh=true"
    log(f"Consultando ventas frescas en {sales_url}...")

    sales_data = None
    for attempt in range(1, 4):
        try:
            req = urllib.request.Request(
                sales_url,
                headers={"User-Agent": "QRBoletos-Daily-Cron/1.0"}
            )
            with urllib.request.urlopen(req, timeout=180) as resp:
                res_json = json.loads(resp.read().decode("utf-8"))
                if res_json.get("success"):
                    sales_data = res_json.get("salesData", [])
                    log(f"✅ Ventas obtenidas exitosamente: {len(sales_data)} eventos activos.")
                    break
                else:
                    log(f"⚠️ Intento {attempt}: Respuesta de ventas no exitosa: {res_json.get('error')}")
        except Exception as e:
            log(f"⚠️ Intento {attempt} falló al contactar {sales_url}: {e}")
        time.sleep(3)

    if not sales_data:
        log("❌ No se pudieron obtener los datos de ventas. Abortando snapshot.")
        sys.exit(1)

    # 2. Tomar Snapshot mediante la API de Snapshots
    snap_endpoint = f"{base_url}/api/reports/snapshots"
    log(f"Guardando snapshot diario en {snap_endpoint}...")

    try:
        payload = json.dumps({
            "action": "take_snapshot",
            "customLabel": None,
            "salesData": sales_data
        }).encode("utf-8")

        req_snap = urllib.request.Request(
            snap_endpoint,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "QRBoletos-Daily-Cron/1.0"
            }
        )
        with urllib.request.urlopen(req_snap, timeout=30) as resp:
            snap_res = json.loads(resp.read().decode("utf-8"))
            if snap_res.get("success"):
                meta = snap_res.get("snapshot", {})
                log(f"📸 Snapshot guardado exitosamente: ID={meta.get('id')} | Etiqueta='{meta.get('label')}'")
                log(f"🎟️ Boletos totales en captura: {meta.get('totalBoletos', 0)} en {meta.get('totalEvents', 0)} eventos.")
                log("🧹 Rotación de 7 días ejecutada automáticamente.")
            else:
                log(f"❌ Error al guardar snapshot: {snap_res.get('error')}")
                sys.exit(1)
    except Exception as e:
        log(f"❌ Error comunicando con la API de snapshots: {e}")
        sys.exit(1)

    log("🎉 Proceso de captura diaria de las 00:00 finalizado con éxito.")
    log("=======================================================")

if __name__ == "__main__":
    main()
