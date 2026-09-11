#!/usr/bin/env python3
"""
fetch_event_settings_chrome.py
Agente de lectura que consulta y extrae en tiempo real la configuración actual
de un evento montado en dashboard.qrboletos.com vía Chrome CDP.
"""

import sys
import os
import re
import json
import time
import argparse
from typing import Dict, Any, Optional
from playwright.sync_api import sync_playwright, Page, BrowserContext

# UTF-8 para stdout/stderr en Windows
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

def parse_args():
    parser = argparse.ArgumentParser(description="Lector de Configuración de Eventos en QRBoletos")
    parser.add_argument("--cdp-url", default="http://localhost:9222", help="URL de depuración remota de Chrome")
    parser.add_argument("--promoter-id", required=True, help="ID del promotor")
    parser.add_argument("--event-id", required=True, help="ID del evento")
    return parser.parse_args()

def log(level: str, msg: str):
    symbols = {"INFO": "ℹ️", "SUCCESS": "✅", "WARNING": "⚠️", "ERROR": "❌"}
    sym = symbols.get(level, "•")
    print(f"[{level}] {sym} {msg}", file=sys.stderr, flush=True)

def find_or_create_qrboletos_page(context: BrowserContext) -> Page:
    for page in context.pages:
        if "qrboletos.com" in page.url:
            log("INFO", f"Usando pestaña activa de QRBoletos: {page.url}")
            return page
    if len(context.pages) > 0:
        log("INFO", f"Usando primera pestaña disponible: {context.pages[0].url}")
        return context.pages[0]
    log("INFO", "Creando nueva pestaña para QRBoletos...")
    return context.new_page()

def fetch_settings():
    args = parse_args()
    target_url = f"https://dashboard.qrboletos.com/promoters/{args.promoter_id}/events/{args.event_id}/settings.aspx"

    log("INFO", f"Conectando a Chrome en {args.cdp_url}...")
    log("INFO", f"Consultando configuración para el evento: {args.event_id}")

    try:
        with sync_playwright() as p:
            try:
                browser = p.chromium.connect_over_cdp(args.cdp_url)
            except Exception as e:
                log("ERROR", f"No se pudo conectar a Chrome en {args.cdp_url}: {e}")
                print(f"###JSON_OUTPUT###" + json.dumps({"success": False, "error": f"Chrome offline en {args.cdp_url}: {e}"}))
                sys.exit(1)

            context = browser.contexts[0]
            page = find_or_create_qrboletos_page(context)

            if page.url != target_url:
                log("INFO", f"Navegando a {target_url}...")
                try:
                    page.goto(target_url, wait_until="domcontentloaded", timeout=25000)
                except Exception as e:
                    if "ERR_ABORTED" in str(e):
                        time.sleep(1.0)
                    else:
                        page.goto(target_url, timeout=25000)
            else:
                log("INFO", "Pestaña ya posicionada en la configuración del evento.")

            time.sleep(1.5)

            # Extraer los datos mediante JS en el navegador
            js_extractor = """() => {
                const ageEl = document.querySelector("a[data-pk='edad']");
                let minAge = ageEl ? ageEl.innerText.trim() : null;
                if (minAge && (minAge === 'Empty' || minAge === 'Vacio' || minAge === '')) {
                    minAge = null;
                }

                const getSwitchVal = (name) => {
                    const input = document.querySelector('input.switch[data-input="' + name + '"]');
                    if (!input) return null;
                    if (window.$ && $(input).data('bootstrap-switch')) {
                        return $(input).bootstrapSwitch('state');
                    }
                    return input.checked;
                };

                const switches = {
                    comida: getSwitchVal('comida'),
                    alcohol: getSwitchVal('alcohol'),
                    embarazadas: getSwitchVal('embarazadas'),
                    discapacitados: getSwitchVal('discapacitados'),
                };

                let descripcion = '';
                try {
                    if (window.CKEDITOR && CKEDITOR.instances && CKEDITOR.instances.descripcion) {
                        descripcion = CKEDITOR.instances.descripcion.getData();
                    } else {
                        const descEl = document.querySelector('#descripcion');
                        descripcion = descEl ? descEl.value : '';
                    }
                } catch(e) {
                    const descEl = document.querySelector('#descripcion');
                    descripcion = descEl ? descEl.value : '';
                }

                let tos = '';
                try {
                    if (window.CKEDITOR && CKEDITOR.instances && CKEDITOR.instances.tos) {
                        tos = CKEDITOR.instances.tos.getData();
                    } else {
                        const tosEl = document.querySelector('#tos');
                        tos = tosEl ? tosEl.value : '';
                    }
                } catch(e) {
                    const tosEl = document.querySelector('#tos');
                    tos = tosEl ? tosEl.value : '';
                }

                const getImgUrl = (key) => {
                    const a = document.querySelector('#image-' + key + '-control-view');
                    const href = a ? a.getAttribute('href') : null;
                    return (href && href.length > 5 && !href.startsWith('#')) ? href : null;
                };

                const images = {
                    home: getImgUrl('home'),
                    afiche: getImgUrl('afiche'),
                    banner: getImgUrl('banner'),
                };

                return {
                    minAge,
                    switches,
                    descripcion: descripcion || '',
                    tos: tos || '',
                    images
                };
            }"""

            extracted = page.evaluate(js_extractor)
            log("SUCCESS", "Configuración extraída exitosamente de QRBoletos.")

            result = {
                "success": True,
                "settings": extracted
            }

            print(f"###JSON_OUTPUT###{json.dumps(result, ensure_ascii=False)}")
            sys.exit(0)

    except Exception as e:
        log("ERROR", f"Error durante la extracción: {e}")
        print(f"###JSON_OUTPUT###{json.dumps({'success': False, 'error': str(e)})}")
        sys.exit(1)

if __name__ == "__main__":
    fetch_settings()
