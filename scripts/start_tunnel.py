import subprocess
import re
import sys
import os

def start_tunnel(port=3001):
    print("=" * 65)
    print(f"   INICIANDO TÚNEL SEGURO HTTPS PARA PUERTO {port}")
    print("=" * 65)
    print("Conectando con el servidor de túnel (localhost.run)...")
    
    cmd = [
        "ssh",
        "-o", "StrictHostKeyChecking=no",
        "-o", "ServerAliveInterval=30",
        "-o", "ServerAliveCountMax=3",
        "-R", f"80:localhost:{port}",
        "nokey@localhost.run"
    ]
    
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )
    
    tunnel_url = None
    url_regex = re.compile(r"https://[a-zA-Z0-9.-]+\.lhr\.life")
    
    for line in iter(process.stdout.readline, ''):
        sys.stdout.write(line)
        sys.stdout.flush()
        
        match = url_regex.search(line)
        if match and not tunnel_url:
            tunnel_url = match.group(0)
            os.makedirs("scratch", exist_ok=True)
            with open("scratch/current_tunnel_url.txt", "w", encoding="utf-8") as f:
                f.write(tunnel_url)
            print("\n" + "#" * 65)
            print(f" >> ¡TÚNEL ACTIVO Y LISTO! <<")
            print(f" URL Pública HTTPS: {tunnel_url}")
            print(f" Auto-registrando en Google Sheets para Vercel...")
            
            # Registrar automáticamente en Google Sheets a través de la API local
            try:
                import urllib.request
                import json
                req_data = json.dumps({"url": tunnel_url}).encode("utf-8")
                req = urllib.request.Request(
                    f"http://localhost:{port}/api/tunnel",
                    data=req_data,
                    headers={"Content-Type": "application/json"}
                )
                with urllib.request.urlopen(req, timeout=10) as resp:
                    res_json = json.loads(resp.read().decode("utf-8"))
                    if res_json.get("success"):
                        print(f" >> [OK] ¡URL guardada en Google Sheets! Vercel la consumirá automáticamente.")
                    else:
                        print(f" >> [AVISO] Respuesta de Sheets: {res_json}")
            except Exception as e:
                print(f" >> [AVISO] No se pudo auto-registrar en Sheets (asegúrate de que el servidor Next.js esté activo en puerto {port}): {e}")

            print("#" * 65 + "\n")
            
    process.stdout.close()
    return_code = process.wait()
    return return_code

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 3001
    start_tunnel(port)
