import subprocess
import re
import sys
import os
import time

def run_ssh_tunnel(port=3001):
    print("=" * 65)
    print(f"   INICIANDO TÚNEL SEGURO HTTPS PARA PUERTO {port}")
    print("=" * 65)
    print("Conectando con el servidor de túnel (localhost.run)...")
    
    cmd = [
        "ssh",
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
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
        if match and match.group(0) != tunnel_url:
            tunnel_url = match.group(0)
            os.makedirs("scratch", exist_ok=True)
            with open("scratch/current_tunnel_url.txt", "w", encoding="utf-8") as f:
                f.write(tunnel_url)
            print("\n" + "#" * 65)
            print(f" >> ¡TÚNEL ACTIVO Y LISTO! <<")
            print(f" URL Pública HTTPS: {tunnel_url}")
            print(f" Auto-registrando en Google Sheets para Vercel...")
            
            # Registrar automáticamente en Google Sheets de forma directa (dando hasta 60s)
            try:
                reg_script = os.path.join(os.path.dirname(__file__), "register_tunnel.js")
                res = subprocess.run(["node", reg_script, tunnel_url], capture_output=True, text=True, timeout=60)
                if res.returncode == 0:
                    print(f" >> [OK] ¡URL guardada en Google Sheets! Vercel la consumirá automáticamente.")
                else:
                    print(f" >> [AVISO] Registro en Sheets: {res.stderr or res.stdout}")
            except Exception as e:
                print(f" >> [AVISO] Error ejecutando registro: {e}")

            print("#" * 65 + "\n")
            
    process.stdout.close()
    return process.wait()

def start_tunnel(port=3001):
    while True:
        try:
            run_ssh_tunnel(port)
        except KeyboardInterrupt:
            print("\n[INFO] Túnel detenido por el usuario.")
            break
        except Exception as e:
            print(f"\n[ERROR] Error en el túnel: {e}")
        print("[REINTENTO] Reconectando túnel en 5 segundos...")
        time.sleep(5)

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 3001
    start_tunnel(port)
