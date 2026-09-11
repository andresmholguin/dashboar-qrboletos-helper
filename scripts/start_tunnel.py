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
            print(f" Configura en Vercel como variable de entorno:")
            print(f" LOCAL_BACKEND_URL={tunnel_url}")
            print("#" * 65 + "\n")
            
    process.stdout.close()
    return_code = process.wait()
    return return_code

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 3001
    start_tunnel(port)
