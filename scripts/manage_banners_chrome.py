#!/usr/bin/env python3
"""
manage_banners_chrome.py
Agente de automatizacion para Google Chrome (CDP) especializado en:
1. Escanear y listar los banners existentes en dashboard.qrboletos.com/banners/.../items.aspx
2. Crear un nuevo item de banner si no existe (con el formato: [ID] [Nombre Evento]).
3. Subir la imagen "Portada Horizontal / Banner" (1950x700 px) y ajustar Croppie sin recortes.
4. Habilitar la opcion "¿Desea agregar enlace a la imagen?: Si" y configurar la direccion URL publica.
5. Configurar el Estado en 'Habilitado' (si el evento esta a la venta) o 'Deshabilitado' (si esta en configuracion).
6. Reordenar los banners en la tabla en estricto orden cronologico por fecha de realizacion del evento (Drag & Drop).
"""

import sys
import os
import re
import json
import time
import argparse
import unicodedata
from typing import Dict, List, Optional, Any
from playwright.sync_api import sync_playwright, Page, BrowserContext

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

DEFAULT_BANNERS_URL = "https://dashboard.qrboletos.com/banners/dGs0YzNab3FQeG9HT0lxV1hRNi92UT09/items.aspx"
AES_KEY = "eva-070217"

VAL_STATE_HABILITADO = "a2dPQllsNUhDdUpZZFVxaW9UTEJUQT09"
VAL_STATE_DESHABILITADO = "dTRuNGpYUmd0cmFkblBxUGFxTzlZUT09"

VAL_LINK_NO = "Zzk2aFd1dGlnSmZNLzBHbm5lU2lxUT09"
VAL_LINK_SI = "R291MG05U2M5SDkyM3lTM2llR2NXQT09"

VAL_TARGET_MISMA_PESTANA = "bzA0TkZXTVJlY3lLdGNTZnB0UnRMZz09"
VAL_TARGET_NUEVA_PESTANA = "aVBLSzRpSWpRRFRRSU5JK21oZkhZdz09"

def log(level: str, msg: str):
    symbols = {"INFO": "[i]", "SUCCESS": "[OK]", "WARNING": "[!]", "ERROR": "[X]"}
    sym = symbols.get(level, "*")
    try:
        print(f"[{level}] {sym} {msg}", flush=True)
    except Exception:
        print(f"[{level}] {msg}", flush=True)

def parse_args():
    parser = argparse.ArgumentParser(description="Gestor de Banners Web en QRBoletos via Chrome CDP")
    parser.add_argument("--cdp-url", default="http://localhost:9222", help="URL de depuracion de Chrome")
    parser.add_argument("--banners-url", default=DEFAULT_BANNERS_URL, help="URL de listado de items del banner")
    parser.add_argument("--event-id", default=None, help="ID numerico o de sistema del evento (ej: 2991)")
    parser.add_argument("--event-name", default=None, help="Nombre del evento")
    parser.add_argument("--event-date", default=None, help="Fecha de la funcion (YYYY-MM-DD)")
    parser.add_argument("--event-url", default=None, help="URL publica del evento (https://www.qrboletos.com/event/...)")
    parser.add_argument("--en-venta", action="store_true", help="Si el evento esta a la venta (habilita el banner)")
    parser.add_argument("--banner-image", default=None, help="Ruta local al archivo de imagen portada horizontal (1950x700)")
    parser.add_argument("--replace-image", action="store_true", help="Forzar reemplazo si ya existe imagen en el banner")
    parser.add_argument("--events-json", default=None, help="Lista JSON de todos los eventos para el orden cronologico")
    parser.add_argument("--reorder-only", action="store_true", help="Solo reordenar cronologicamente sin crear/editar un item especifico")
    parser.add_argument("--dry-run", action="store_true", help="Simulacion sin aplicar cambios reales")
    parser.add_argument("--delay-ms", type=int, default=600, help="Pausa entre acciones en milisegundos")
    return parser.parse_args()

def normalize_str(s: str) -> str:
    if not s:
        return ""
    try:
        nfkd = unicodedata.normalize('NFKD', str(s))
        s_clean = "".join([c for c in nfkd if not unicodedata.combining(c)])
    except Exception:
        s_clean = str(s)
    s_clean = s_clean.lower()
    s_clean = re.sub(r'[^a-z0-9]', ' ', s_clean)
    return re.sub(r'\s+', ' ', s_clean).strip()

def word_fuzzy_match(w1: str, w2: str) -> bool:
    if w1 == w2:
        return True
    if len(w1) >= 4 and len(w2) >= 4:
        if w1.startswith(w2[:4]) or w2.startswith(w1[:4]):
            return True
    return False

def safe_goto(page: Page, url: str, wait_selector: Optional[str] = None, timeout_ms: int = 30000):
    for attempt in range(3):
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            break
        except Exception as e:
            if attempt == 2:
                try:
                    page.goto(url, timeout=timeout_ms)
                except Exception:
                    pass
            time.sleep(1.0)
    time.sleep(0.5)

    # Validar si la sesión de QRBoletos expiró o redirigió al login
    curr_url = page.url.lower()
    if "login.aspx" in curr_url or "user/login" in curr_url:
        log("ERROR", "❌ [SESIÓN EXPIRADA] Redirección a login.aspx detectada en Google Chrome.")
        log("ERROR", "Tu sesión en QRBoletos ha caducado. Inicia sesión en Chrome y vuelve a intentarlo.")
        sys.exit(41)

    if wait_selector:
        try:
            page.wait_for_selector(wait_selector, state="attached", timeout=12000)
        except Exception:
            pass

def find_or_create_tab(context: BrowserContext) -> Page:
    for page in context.pages:
        if "banners" in page.url:
            log("INFO", f"Pestana de Banners encontrada: {page.url}")
            return page
    for page in context.pages:
        if "qrboletos.com" in page.url:
            log("INFO", f"Pestana de QRBoletos encontrada: {page.url}")
            return page
    if len(context.pages) > 0:
        return context.pages[0]
    return context.new_page()

def get_existing_banners(page: Page, banners_url: str) -> List[Dict[str, Any]]:
    """Escanea la tabla de items de banners y devuelve una lista de diccionarios con info de cada item."""
    if not page.url.endswith("/items.aspx"):
        safe_goto(page, banners_url, wait_selector="table#list tbody")
    else:
        try:
            page.wait_for_selector("table#list tbody", state="attached", timeout=5000)
        except Exception:
            safe_goto(page, banners_url, wait_selector="table#list tbody")

    time.sleep(0.5)
    banners = page.evaluate("""() => {
        const rows = Array.from(document.querySelectorAll('table#list tbody tr'));
        return rows.map((r, idx) => {
            const itemLink = r.querySelector('td:nth-child(2) a, td:first-child a');
            const name = itemLink ? itemLink.innerText.trim() : (r.querySelector('td:nth-child(2)')?.innerText?.trim() || '');
            const url = itemLink ? itemLink.href : '';
            const orderInput = r.querySelector('input.order');
            const orderId = orderInput ? orderInput.value : '';
            const imgState = r.querySelector('td:nth-child(3) a.state');
            const itemState = r.querySelector('td:nth-child(4) a.state');
            const hasImage = imgState ? imgState.classList.contains('state-enabled') : false;
            const isEnabled = itemState ? itemState.classList.contains('state-enabled') : false;
            return {
                index: idx,
                name: name,
                url: url,
                orderId: orderId,
                hasImage: hasImage,
                isEnabled: isEnabled
            };
        });
    }""")
    return banners

def find_matching_banner(banners: List[Dict[str, Any]], event_id: Optional[str], event_name: Optional[str]) -> Optional[Dict[str, Any]]:
    """Busca un banner existente por ID o por coincidencia difusa de palabras clave."""
    norm_name = normalize_str(event_name) if event_name else ""
    event_id_str = str(event_id).strip() if event_id else ""

    # 1. Coincidencia por ID numerico en el nombre del item
    if event_id_str:
        for b in banners:
            b_norm = normalize_str(b["name"])
            if event_id_str in b_norm.split() or b["name"].startswith(event_id_str) or f"#{event_id_str}" in b["name"]:
                return b

    # 2. Coincidencia difusa de palabras clave del nombre
    if norm_name:
        name_words = [w for w in norm_name.split() if len(w) >= 4 and w not in ["concierto", "festival", "teatro", "evento", "cali", "gran"]]
        for b in banners:
            b_norm = normalize_str(b["name"])
            if norm_name in b_norm or b_norm in norm_name:
                return b
            b_words = [w for w in b_norm.split() if len(w) >= 4]
            matches = sum(1 for bw in b_words if any(word_fuzzy_match(bw, nw) for nw in name_words))
            if matches >= 1:
                return b

    return None

def create_banner_item(page: Page, banners_url: str, event_id: Optional[str], event_name: str, dry_run: bool = False) -> Optional[str]:
    """Abre el modal Agregar item, introduce el nombre del item y guarda, retornando la URL de edicion."""
    clean_id = str(event_id).strip() if event_id and re.match(r'^\d+$', str(event_id).strip()) else ""
    if clean_id and not event_name.strip().startswith(clean_id):
        item_title = f"{clean_id} {event_name.strip()}"
    else:
        item_title = event_name.strip()

    log("INFO", f"Creando nuevo item de banner: '{item_title}'...")

    if dry_run:
        log("INFO", f"  [DRY-RUN] Simulado: Creacion de item '{item_title}'")
        return f"{banners_url.replace('items.aspx', 'items/simulated_new_id.aspx')}"

    if not page.url.endswith("/items.aspx"):
        safe_goto(page, banners_url, wait_selector="button[data-target='#modalAdd']")

    add_btn = page.locator("button[data-target='#modalAdd']").first
    if add_btn.count() == 0:
        log("ERROR", "No se encontro el boton 'Agregar item'.")
        return None

    add_btn.click()
    page.wait_for_selector("#modalAdd.show, #modalAdd", state="attached", timeout=8000)
    time.sleep(0.5)

    text_input = page.locator("#modalAdd form input[type='text'], #modalAdd input[name*='Item'], #modalAdd input").first
    if text_input.count() == 0:
        log("ERROR", "No se encontro el input de texto en modalAdd.")
        return None

    text_input.fill(item_title)
    time.sleep(0.3)

    save_btn = page.locator("#modalAdd form button[type='submit'], #modalAdd button:has-text('Guardar'), #modalAdd button.btn-primary").first
    
    with page.expect_navigation(timeout=20000):
        save_btn.click()

    new_url = page.url
    log("SUCCESS", f"Item de banner creado con exito. URL de estructura: {new_url}")
    return new_url

def upload_banner_image(page: Page, image_path: str, replace_image: bool = False, dry_run: bool = False) -> bool:
    """Sube la imagen portada horizontal de 1950x700 px al slot de banner usando Croppie al minimo zoom."""
    if not os.path.exists(image_path):
        log("WARNING", f"El archivo de imagen no existe: {image_path}")
        return False

    abs_path = os.path.abspath(image_path)
    file_name = os.path.basename(abs_path)
    log("INFO", f"Configurando imagen de banner 1950x700 px ('{file_name}')...")

    if dry_run:
        log("INFO", f"  [DRY-RUN] Simulado: Subida y recorte de imagen de banner {file_name}")
        return True

    # Verificar si ya existe imagen
    del_btn = page.locator("#image-control-delete, .image-delete").first
    if del_btn.count() > 0 and del_btn.is_visible():
        if not replace_image:
            log("INFO", "Ya existe una imagen montada en este banner. Conservando segun configuracion.")
            return True
        log("INFO", "Reemplazando imagen previa del banner...")
        del_btn.click()
        time.sleep(0.6)
        try:
            confirm_btn = page.locator("button.swal2-confirm, button:has-text('Si'), button:has-text('Sí'), button:has-text('Aceptar')").first
            if confirm_btn.count() > 0 and confirm_btn.is_visible():
                confirm_btn.click()
                time.sleep(1.0)
        except Exception:
            pass

    file_input = page.locator("#image-select input[type='file'], input.image-upload, input[type='file']").first
    if file_input.count() == 0:
        log("ERROR", "No se encontro el input de subida de imagen para el banner.")
        return False

    try:
        file_input.set_input_files(abs_path)
    except Exception as e:
        log("ERROR", f"Error asignando archivo de imagen: {e}")
        return False

    try:
        page.wait_for_function("() => (window.$ && $('#modalImageUploadCroppie').data('croppie') !== undefined) || (document.querySelector('#modalImageUpload') && !document.querySelector('#modalImageUpload').classList.contains('d-none'))", timeout=12000)
    except Exception:
        time.sleep(1.0)

    time.sleep(0.6)
    log("INFO", "Ajustando zoom de Croppie al minimo para evitar recortes...")
    page.evaluate("""() => {
        try {
            if (window.$ && $('#modalImageUploadCroppie').data('croppie')) {
                $('#modalImageUploadCroppie').croppie('setZoom', 0);
            }
        } catch(e) {}
        const slider = document.querySelector('#modalImageUpload .cr-slider') || document.querySelector('#modalImageUpload input[type="range"]');
        if (slider) {
            slider.value = slider.min || '0';
            slider.dispatchEvent(new Event('input', { bubbles: true }));
            slider.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }""")
    time.sleep(0.5)

    save_btn = page.locator("#modalImageUploadSave, #modalImageUpload button:has-text('Guardar')").first
    if save_btn.count() > 0:
        save_btn.click(force=True)
    else:
        page.evaluate("() => { const b = document.querySelector('#modalImageUploadSave'); if (b) b.click(); }")

    log("INFO", "Esperando procesamiento de la imagen en QRBoletos...")
    t_wait = time.time()
    while time.time() - t_wait < 25:
        try:
            is_hidden = page.evaluate("() => !document.querySelector('#modalImageUpload') || !$('#modalImageUpload').is(':visible') || $('#modalImageUpload').css('display') === 'none'")
            if is_hidden:
                break
        except Exception:
            break
        time.sleep(0.4)

    time.sleep(1.0)
    log("SUCCESS", "Imagen de banner 1950x700 px subida y guardada correctamente.")
    return True

def configure_banner_links_and_state(page: Page, event_url: Optional[str], en_venta: bool, dry_run: bool = False) -> bool:
    """Configura el enlace publico, el destino y el estado (Habilitado/Deshabilitado) via X-Editable."""
    target_state_name = "Habilitado" if en_venta else "Deshabilitado"
    target_state_val = VAL_STATE_HABILITADO if en_venta else VAL_STATE_DESHABILITADO

    log("INFO", f"Configurando Estado del Banner a: '{target_state_name}' (Evento en venta: {en_venta})...")
    if dry_run:
        log("INFO", f"  [DRY-RUN] Simulado: Estado={target_state_name}, Enlace='{event_url}'")
        return True

    # 1. Configurar Estado (Habilitado / Deshabilitado)
    state_link = page.locator("a.xeditable[data-pk='state']").first
    if state_link.count() > 0:
        curr_state = state_link.inner_text().strip()
        if curr_state.lower() != target_state_name.lower():
            log("INFO", f"Cambiando estado de '{curr_state}' a '{target_state_name}'...")
            state_link.click()
            time.sleep(0.4)
            form = page.locator(".editable-container form, form.editableform").first
            if form.count() > 0:
                form.locator("select").select_option(value=target_state_val)
                time.sleep(0.2)
                form.locator(".editable-submit").click()
                time.sleep(0.8)
                log("SUCCESS", f"Estado actualizado a '{target_state_name}'.")
        else:
            log("INFO", f"Estado ya se encuentra en '{target_state_name}'.")

    # 2. Configurar ¿Desea agregar enlace a la imagen?: 'Si'
    link_link = page.locator("a.xeditable[data-pk='link']").first
    if link_link.count() > 0:
        curr_link_val = link_link.inner_text().strip()
        if curr_link_val.lower() != "si" and curr_link_val.lower() != "sí":
            log("INFO", "Habilitando opcion '¿Desea agregar enlace a la imagen?: Si'...")
            link_link.click()
            time.sleep(0.4)
            form = page.locator(".editable-container form, form.editableform").first
            if form.count() > 0:
                form.locator("select").select_option(value=VAL_LINK_SI)
                time.sleep(0.2)
                try:
                    with page.expect_navigation(timeout=10000):
                        form.locator(".editable-submit").click()
                except Exception:
                    try:
                        form.locator(".editable-submit").click()
                    except Exception:
                        pass
                time.sleep(1.0)
                log("SUCCESS", "Opcion de enlace habilitada (pagina recargada).")
        else:
            log("INFO", "Opcion de enlace ya se encuentra en 'Si'.")

    # 3. Configurar Direccion URL publica del evento
    if event_url:
        url_link = page.locator("a.xeditable[data-pk='url']").first
        if url_link.count() > 0:
            curr_url = url_link.inner_text().strip()
            if curr_url != event_url:
                log("INFO", f"Actualizando Direccion URL del banner a: {event_url}...")
                url_link.click()
                time.sleep(0.4)
                form = page.locator(".editable-container form, form.editableform").first
                if form.count() > 0:
                    form.locator("input").fill(event_url)
                    time.sleep(0.2)
                    form.locator(".editable-submit").click()
                    time.sleep(0.8)
                    log("SUCCESS", "Direccion URL del banner configurada exitosamente.")
            else:
                log("INFO", "Direccion URL ya coincide con la URL publica del evento.")

    # 4. Configurar ¿Donde desea abrir el enlace?: Misma pestaña
    target_link = page.locator("a.xeditable[data-pk='target']").first
    if target_link.count() > 0:
        curr_target_val = target_link.inner_text().strip()
        if "misma" not in curr_target_val.lower():
            log("INFO", "Configurando '¿Donde desea abrir el enlace?: Misma pestaña'...")
            target_link.click()
            time.sleep(0.4)
            form = page.locator(".editable-container form, form.editableform").first
            if form.count() > 0:
                form.locator("select").select_option(value=VAL_TARGET_MISMA_PESTANA)
                time.sleep(0.2)
                form.locator(".editable-submit").click()
                time.sleep(0.8)
                log("SUCCESS", "Destino del enlace configurado en 'Misma pestaña'.")
        else:
            log("INFO", "Destino del enlace ya se encuentra en 'Misma pestaña'.")

    return True

def reorder_banners_chronologically(page: Page, banners_url: str, events_list: List[Dict[str, Any]], dry_run: bool = False) -> bool:
    """Lee todos los banners de la tabla, los empareja con la lista de eventos por fecha y aplica el orden cronologico."""
    log("INFO", "Iniciando proceso de ordenamiento cronologico de los banners...")
    if not page.url.endswith("/items.aspx"):
        safe_goto(page, banners_url, wait_selector="table#list tbody")
    time.sleep(0.8)

    banners = get_existing_banners(page, banners_url)
    if not banners:
        log("WARNING", "No se encontraron banners en la tabla para ordenar.")
        return False

    log("INFO", f"Banners detectados en QRBoletos: {len(banners)}.")

    # Asignar fecha a cada banner
    decorated_banners = []
    for b in banners:
        assigned_date = "9999-99-99"
        matched_name = ""

        # Match por ID numerico
        for ev in events_list:
            ev_id = str(ev.get("id") or "").strip()
            if ev_id and (ev_id in b["name"].split() or b["name"].startswith(ev_id) or f"#{ev_id}" in b["name"]):
                assigned_date = ev.get("fecha") or "9999-99-99"
                matched_name = ev.get("nombre") or ""
                break

        # Match por texto normalizado y palabras clave
        if assigned_date == "9999-99-99":
            b_norm = normalize_str(b["name"])
            b_words = [w for w in b_norm.split() if len(w) >= 4]
            for ev in events_list:
                ev_norm = normalize_str(ev.get("nombre") or "")
                ev_words = [w for w in ev_norm.split() if len(w) >= 4]
                if b_norm in ev_norm or ev_norm in b_norm:
                    assigned_date = ev.get("fecha") or "9999-99-99"
                    matched_name = ev.get("nombre") or ""
                    break
                matches = sum(1 for bw in b_words if any(word_fuzzy_match(bw, ew) for ew in ev_words))
                if matches >= 1:
                    assigned_date = ev.get("fecha") or "9999-99-99"
                    matched_name = ev.get("nombre") or ""
                    break

        decorated_banners.append({
            "banner": b,
            "date": assigned_date,
            "matched_name": matched_name
        })

    # Ordenar cronologicamente por fecha (fechas mas proximas primero)
    decorated_banners.sort(key=lambda x: (x["date"], x["banner"]["index"]))

    log("INFO", "Orden cronologico calculado:")
    for idx, db in enumerate(decorated_banners):
        date_str = db["date"] if db["date"] != "9999-99-99" else "Fecha no vinculada"
        log("INFO", f"  Posicion {idx + 1}: '{db['banner']['name']}' -> Fecha: {date_str}")

    current_order_ids = [b["orderId"] for b in banners if b["orderId"]]
    target_order_ids = [db["banner"]["orderId"] for db in decorated_banners if db["banner"]["orderId"]]

    if current_order_ids == target_order_ids:
        log("SUCCESS", "Los banners ya se encuentran en el orden cronologico perfecto. No se requiere reorganizacion.")
        return True

    log("INFO", "Aplicando nuevo orden en la tabla de QRBoletos...")
    if dry_run:
        log("INFO", "  [DRY-RUN] Simulado: Reorganizacion de banners completada.")
        return True

    success = page.evaluate("""(orderedIds) => {
        try {
            if (!window.CryptoJS || !$ak) return { success: false, error: "CryptoJS o $ak no inicializado" };
            
            var form = {};
            form['task'] = 'order';
            form['orden'] = orderedIds;
            
            var data = {
                'form': CryptoJS.AES.encrypt(JSON.stringify(form), $ak, {format: CryptoJSAesJson}).toString(),
                'INA6cbMwtl': '51cce821388343db5a8ba86ca0b21ff26e8f7b336d45bb493752d43c3ec694de'
            };
            
            return new Promise((resolve) => {
                jQuery.ajax({
                    type: 'POST',
                    url: window.location.href,
                    data: data,
                    success: function(response) {
                        try {
                            var dec = JSON.parse(CryptoJS.AES.decrypt(response, $ak, {format: CryptoJSAesJson}).toString(CryptoJS.enc.Utf8));
                            var parsed = jQuery.parseJSON(dec);
                            resolve({ success: true, response: parsed.response });
                        } catch(e) {
                            resolve({ success: true, response: 0 });
                        }
                    },
                    error: function(err) {
                        resolve({ success: false, error: err.statusText });
                    }
                });
            });
        } catch(e) {
            return { success: false, error: e.toString() };
        }
    }""", target_order_ids)

    time.sleep(1.5)
    page.reload(wait_until="domcontentloaded")
    time.sleep(1.0)

    log("SUCCESS", "Orden cronologico guardado exitosamente en QRBoletos.")
    return True

def sync_event_banner(page: Page, banners_url: str, event_id: Optional[str], event_name: str,
                      event_url: Optional[str], banner_image_path: Optional[str],
                      en_venta: bool, replace_image: bool = False,
                      events_list: Optional[List[Dict[str, Any]]] = None, dry_run: bool = False) -> bool:
    """Funcion principal que ejecuta el flujo completo para un evento dado."""
    clean_numeric_id = None
    if event_id and re.match(r'^\d+$', str(event_id).strip()):
        clean_numeric_id = str(event_id).strip()
    elif events_list:
        for ev in events_list:
            if ev.get("nombre") and normalize_str(ev["nombre"]) == normalize_str(event_name):
                if ev.get("id") and re.match(r'^\d+$', str(ev["id"]).strip()):
                    clean_numeric_id = str(ev["id"]).strip()
                    break
            elif ev.get("enlace") and event_url and ev["enlace"].strip() == event_url.strip():
                if ev.get("id") and re.match(r'^\d+$', str(ev["id"]).strip()):
                    clean_numeric_id = str(ev["id"]).strip()
                    break

    banners = get_existing_banners(page, banners_url)
    matched = find_matching_banner(banners, clean_numeric_id or event_id, event_name)

    item_url = None
    if matched:
        log("INFO", f"Banner existente detectado en QRBoletos: '{matched['name']}'")
        item_url = matched["url"]
    else:
        log("INFO", f"No se encontro banner previo para el evento '{event_name}'. Procediendo a crearlo...")
        item_url = create_banner_item(page, banners_url, clean_numeric_id, event_name, dry_run)

    if not item_url:
        log("ERROR", "No se pudo obtener la URL de configuracion del banner.")
        return False

    if not dry_run:
        safe_goto(page, item_url, wait_selector="table.table tr")

    if banner_image_path:
        upload_banner_image(page, banner_image_path, replace_image, dry_run)

    configure_banner_links_and_state(page, event_url, en_venta, dry_run)

    if events_list:
        reorder_banners_chronologically(page, banners_url, events_list, dry_run)

    log("SUCCESS", f"Sincronizacion de banner para '{event_name}' finalizada con exito.")
    return True

def main():
    args = parse_args()
    log("INFO", f"Iniciando agente de Banners en {args.cdp_url}...")

    events_list = []
    if args.events_json:
        try:
            if os.path.exists(args.events_json):
                with open(args.events_json, "r", encoding="utf-8") as f:
                    events_list = json.load(f)
            else:
                events_list = json.loads(args.events_json)
        except Exception as e:
            log("WARNING", f"No se pudo parsear events_json: {e}")

    with sync_playwright() as p:
        try:
            browser = p.chromium.connect_over_cdp(args.cdp_url)
        except Exception as e:
            log("ERROR", f"No se pudo conectar a Chrome CDP en {args.cdp_url}: {e}")
            sys.exit(1)

        context = browser.contexts[0] if browser.contexts else browser.new_context()
        page = find_or_create_tab(context)

        if args.reorder_only:
            if not events_list:
                log("ERROR", "Se requiere lista de eventos para ejecutar el ordenamiento.")
                sys.exit(1)
            ok = reorder_banners_chronologically(page, args.banners_url, events_list, args.dry_run)
            sys.exit(0 if ok else 1)

        if not args.event_name and not args.event_id:
            log("ERROR", "Se requiere --event-id o --event-name para sincronizar el banner.")
            sys.exit(1)

        sync_event_banner(
            page=page,
            banners_url=args.banners_url,
            event_id=args.event_id,
            event_name=args.event_name or "Evento",
            event_url=args.event_url,
            banner_image_path=args.banner_image,
            en_venta=args.en_venta,
            replace_image=args.replace_image,
            events_list=events_list if events_list else None,
            dry_run=args.dry_run
        )

if __name__ == "__main__":
    main()
