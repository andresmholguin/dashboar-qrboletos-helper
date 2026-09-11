#!/usr/bin/env python3
"""
update_artworks_chrome.py
Agente de automatizacion para Google Chrome (CDP) especializado en:
1. Reemplazar o actualizar el QRBoleto Digital (1465x550 px) en todos los precios del evento.
2. Reemplazar o actualizar el Diseno de Impresion Fisico 63X177 (1134x236 px) en impresoras Boca y Godex (omitiendo 63X177PP).
3. Llevar automaticamente el manejador de zoom de Croppie.js al minimo absoluto para encajar la imagen sin recortes.
4. Si replace_images esta activado, elimina la imagen previa, confirma el dialogo modal de QRBoletos ('Si') y sube el nuevo diseno.
5. Permite actualizar tambien imagenes promocionales del evento (miniatura, portada vertical, portada horizontal).
"""

import sys
import os
import re
import json
import time
import argparse
from typing import Dict, List, Optional
from playwright.sync_api import sync_playwright, Page, BrowserContext

# Forzar codificacion UTF-8 para stdout y stderr en Windows
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

def parse_args():
    parser = argparse.ArgumentParser(description="Actualizador de Artes de Boleteria via Chrome CDP")
    parser.add_argument("--cdp-url", default="http://localhost:9222", help="URL de depuracion remota de Chrome")
    parser.add_argument("--promoter-id", required=True, help="ID del promotor")
    parser.add_argument("--event-id", required=True, help="ID del evento")
    parser.add_argument("--show-id", default=None, help="ID del show/espectaculo (requerido si hay boletos)")
    parser.add_argument("--digital-image", default=None, help="Ruta al archivo QRBoleto Digital (1465x550)")
    parser.add_argument("--print-image", default=None, help="Ruta al diseno de impresion fisico 63X177 (1134x236)")
    parser.add_argument("--image-home", default=None, help="Ruta a la imagen miniatura (720x639)")
    parser.add_argument("--image-afiche", default=None, help="Ruta a la imagen portada vertical (800x800)")
    parser.add_argument("--image-banner", default=None, help="Ruta a la imagen portada horizontal (1950x700)")
    parser.add_argument("--event-numeric-id", default=None, help="ID numerico del evento (ej: 3085)")
    parser.add_argument("--event-name", default=None, help="Nombre del evento para banner")
    parser.add_argument("--event-url", default=None, help="URL publica del evento")
    parser.add_argument("--en-venta", action="store_true", help="Si el evento esta a la venta (habilita banner)")
    parser.add_argument("--events-json", default=None, help="Lista JSON de eventos para ordenamiento de banners")
    parser.add_argument("--replace-images", action="store_true", help="Si se activa, elimina imagenes existentes para reemplazarlas")
    parser.add_argument("--sections-json", default=None, help="Lista JSON opcional de nombres o IDs de localidades a procesar")
    parser.add_argument("--dry-run", action="store_true", help="Modo simulacion sin aplicar cambios")
    parser.add_argument("--delay-ms", type=int, default=500, help="Espera en milisegundos entre acciones")
    return parser.parse_args()

def log(level: str, msg: str):
    symbols = {"INFO": "[i]", "SUCCESS": "[OK]", "WARNING": "[!]", "ERROR": "[X]"}
    sym = symbols.get(level, "*")
    try:
        print(f"[{level}] {sym} {msg}", flush=True)
    except Exception:
        print(f"[{level}] {msg}", flush=True)

def safe_goto(page: Page, url: str, wait_selector: Optional[str] = None, timeout_ms: int = 30000):
    """Navegacion ultra resiliente con reintentos para evitar fallos por ASP.NET o redirecciones concurrentes."""
    for attempt in range(3):
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            break
        except Exception as e:
            err = str(e)
            if attempt < 2 and ("interrupted" in err.lower() or "aborted" in err.lower() or "context" in err.lower()):
                time.sleep(1.2)
                continue
            elif attempt == 2:
                try:
                    page.goto(url, timeout=timeout_ms)
                except Exception:
                    pass
    time.sleep(0.6)
    if wait_selector:
        try:
            page.wait_for_selector(wait_selector, state="attached", timeout=12000)
        except Exception:
            pass

def find_or_create_qrboletos_page(context: BrowserContext) -> Page:
    for page in context.pages:
        if "qrboletos.com" in page.url:
            log("INFO", f"Pestana encontrada de QRBoletos: {page.url}")
            return page
    if len(context.pages) > 0:
        log("INFO", f"Usando la primera pestana activa: {context.pages[0].url}")
        return context.pages[0]
    return context.new_page()

def extract_sections_from_page(page: Page) -> Dict[str, str]:
    """Escanea sections.aspx para obtener { nombre_localidad: id_seccion }"""
    sections = {}
    try:
        page.wait_for_selector("#sections-box, div.card, .section-item", state="attached", timeout=15000)
    except Exception:
        pass

    cards = page.locator("#sections-box div.card")
    if cards.count() == 0:
        cards = page.locator("div.card, .section-item")
    count = cards.count()
    log("INFO", f"Analizando {count} tarjetas en sections.aspx...")

    for i in range(count):
        card = cards.nth(i)
        links = card.locator("a[href*='/sections/']")
        link_count = links.count()
        section_id = None
        for j in range(link_count):
            href = links.nth(j).get_attribute("href") or ""
            m = re.search(r'/sections/([^/?#]+?)(?:\.aspx|/|$)', href)
            if m:
                extracted = m.group(1)
                if extracted.lower() not in ["editor", "settings", "sections", "list", "new", "matrix"]:
                    section_id = extracted
                    break

        nombre = None
        try:
            card_text = card.inner_text()
            loc_m = re.search(r'Localidad:\s*([^\n\r]+)', card_text, re.IGNORECASE)
            if loc_m:
                raw_name = loc_m.group(1).split("Modalidad")[0].split("ID:")[0].strip()
                if raw_name:
                    nombre = raw_name
        except Exception:
            pass

        if not nombre:
            title_el = card.locator(".card-title, h4, h5, .title, strong").first
            if title_el.count() > 0:
                raw = title_el.inner_text().strip()
                if raw and "agregar" not in raw.lower() and "precio" not in raw.lower():
                    nombre = raw

        if section_id and nombre:
            nombre_clean = nombre.strip().upper()
            if nombre_clean not in ["AGREGAR PRECIO", "NUEVA LOCALIDAD"]:
                sections[nombre_clean] = section_id
                log("INFO", f"  * Localidad detectada: '{nombre_clean}' -> ID: {section_id}")

    return sections

def prepare_image_slot(page: Page, del_btn_locator, select_btn_locator, context_label: str, replace_images: bool = False, dry_run: bool = False, delay_ms: int = 500) -> bool:
    """
    Verifica si el slot de imagen ya tiene un archivo cargado.
    - Si ya tiene imagen cargada (el boton Eliminar es visible):
      * Si replace_images es False: omite la subida (conserva la existente).
      * Si replace_images es True: pulsa 'Eliminar', confirma en el modal ('Si') y espera que el selector quede listo.
    - Si no tiene imagen: retorna True para proceder a la carga.
    """
    has_existing = False
    try:
        has_existing = (del_btn_locator.count() > 0 and del_btn_locator.is_visible())
    except Exception:
        has_existing = False

    if has_existing:
        if not replace_images:
            log("INFO", f"    {context_label}: Ya tiene imagen cargada. [CONSERVADO] (omitiendo reemplazo).")
            return False

        if dry_run:
            log("INFO", f"    [DRY-RUN] {context_label}: Imagen existente detectada. Se pulsaria 'Eliminar' y se confirmaria.")
            return True

        log("INFO", f"    {context_label}: Imagen existente detectada. Pulsando 'Eliminar' para reemplazar...")
        try:
            del_btn_locator.click(force=True)
        except Exception as e:
            log("WARNING", f"    {context_label}: Error al hacer clic en 'Eliminar': {e}")

        time.sleep(0.5)

        # Confirmar en dialogo jconfirm si aparece
        confirmed = False
        try:
            confirm_btn = page.locator(".jconfirm-buttons button.btn-primary, .jconfirm button:has-text('Si')").first
            if confirm_btn.count() > 0 and confirm_btn.is_visible():
                confirm_btn.click(force=True)
                confirmed = True
                log("INFO", f"    {context_label}: Confirmacion 'Si' enviada.")
        except Exception:
            pass

        if not confirmed:
            try:
                page.evaluate("if (window.jconfirm && jconfirm.instances) jconfirm.instances.forEach(i => { try { i.buttons.confirm.action(); } catch(err){} });")
            except Exception:
                pass

        # Esperar a que el boton eliminar desaparezca y el slot se refresque
        t0 = time.time()
        while time.time() - t0 < 10:
            try:
                if del_btn_locator.count() == 0 or not del_btn_locator.is_visible():
                    break
            except Exception:
                break
            time.sleep(0.4)

        time.sleep(delay_ms / 1000.0)
        log("SUCCESS", f"    {context_label}: Imagen previa eliminada. Listo para subir nuevo diseno.")
        return True

    return True

def handle_image_croppie_upload(page: Page, file_input_locator, image_path: str, context_label: str, dry_run: bool = False, delay_ms: int = 500) -> bool:
    """
    Asigna el archivo al input de subida, espera al modal Croppie (#modalImageUpload),
    lleva el zoom al minimo absoluto para encajar la imagen sin recortes y hace clic en Guardar de forma robusta.
    """
    if not image_path or not os.path.exists(image_path):
        log("WARNING", f"    Ruta de imagen inexistente para {context_label}: {image_path}")
        return False

    abs_path = os.path.abspath(image_path)
    file_name = os.path.basename(abs_path)

    if dry_run:
        log("INFO", f"    [DRY-RUN] {context_label}: Se asignaria '{file_name}', zoom ajustado al minimo y clic en Guardar.")
        return True

    try:
        if not file_input_locator or file_input_locator.count() == 0:
            if "digital" in context_label.lower():
                file_input_locator = page.locator("#image-eticket-select input.image-upload, #image-eticket-select input[type='file'], input.image-upload[data-width-result='1465'], input.image-upload").first
            else:
                file_input_locator = page.locator("input.image-upload[data-height='236'][data-width='1134'], input.image-upload, input[type='file']").first

        if file_input_locator.count() == 0:
            log("ERROR", f"    No se encontro el selector de archivo para {context_label}.")
            return False

        try:
            file_input_locator.wait_for(state="attached", timeout=8000)
        except Exception:
            pass

        log("INFO", f"    {context_label}: Asignando archivo '{file_name}'...")
        file_input_locator.set_input_files(abs_path)

        # Esperar que Croppie inicialice en el modal
        try:
            page.wait_for_function("() => (window.$ && $('#modalImageUploadCroppie').data('croppie') !== undefined) || (document.querySelector('#modalImageUpload') && !document.querySelector('#modalImageUpload').classList.contains('d-none'))", timeout=12000)
        except Exception:
            time.sleep(1.0)

        modal = page.locator("#modalImageUpload")
        time.sleep(0.6)

        # Ajustar slider de zoom al minimo
        log("INFO", f"    {context_label}: Ajustando manejador de zoom al minimo para encajar la imagen...")
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

        # Clic en Guardar del modal (robusto: force=True y fallback JavaScript)
        log("INFO", f"    {context_label}: Clic en Guardar recorte. Procesando guardado en servidor...")
        clicked = False
        try:
            btn_guardar = modal.locator("#modalImageUploadSave, button:has-text('Guardar')").first
            if btn_guardar.count() > 0:
                btn_guardar.click(force=True, timeout=4000)
                clicked = True
        except Exception:
            pass

        if not clicked:
            page.evaluate("""() => {
                const btn = document.querySelector('#modalImageUploadSave') || Array.from(document.querySelectorAll('#modalImageUpload button')).find(b => b.innerText.includes('Guardar'));
                if (btn) btn.click();
            }""")

        # Esperar a que el modal se oculte tras guardar el AJAX
        t_wait = time.time()
        while time.time() - t_wait < 25:
            try:
                is_hidden = page.evaluate("() => !document.querySelector('#modalImageUpload') || !$('#modalImageUpload').is(':visible') || $('#modalImageUpload').css('display') === 'none'")
                if is_hidden:
                    break
            except Exception:
                break
            time.sleep(0.4)

        time.sleep(delay_ms / 1000.0)
        log("SUCCESS", f"    {context_label}: Imagen guardada con exito.")
        return True
    except Exception as e:
        log("ERROR", f"    {context_label}: Error durante la subida o recorte de imagen: {e}")
        return False

def extract_price_links_from_sales_page(page: Page) -> List[Dict[str, str]]:
    """Extrae las filas de precios desde prices/sales.aspx con nombre, ID y URL base, esperando a que la tabla cargue."""
    prices = []
    # Espera obligatoria a que aparezcan enlaces de precios
    try:
        page.wait_for_selector("a[href*='/prices/sales/']", state="attached", timeout=12000)
    except Exception:
        time.sleep(1.0)

    # Extraer todos los enlaces de precios directamente para evitar perder filas por retrasos de tablas
    seen_ids = set()
    links = page.locator("a[href*='/prices/sales/']").all()
    for l in links:
        href = l.get_attribute("href") or ""
        m = re.search(r'/prices/sales/([^/?#]+)', href)
        if m:
            raw_id = m.group(1)
            clean_id = re.sub(r'\.aspx$', '', raw_id)
            if clean_id not in seen_ids:
                seen_ids.add(clean_id)
                # Obtener nombre o referencia
                text = l.inner_text().strip()
                # Intentar buscar la fila entera para tener un nombre mas completo
                row_name = text
                try:
                    row = l.locator("xpath=ancestor::tr").first
                    if row.count() > 0:
                        first_td = row.locator("td").first
                        if first_td.count() > 0:
                            row_name = first_td.inner_text().strip()
                except Exception:
                    pass

                row_name = re.sub(r'[\r\n\t]+', ' ', row_name).strip() or text or clean_id
                prices.append({
                    "id": clean_id,
                    "nombre": row_name,
                    "url": href
                })

    return prices

def upload_event_settings_image(page: Page, img_type: str, file_path: str, label: str, dry_run: bool = False) -> bool:
    if not file_path or not os.path.exists(file_path):
        return False
    abs_path = os.path.abspath(file_path)
    file_name = os.path.basename(abs_path)
    log("INFO", f"Subiendo {label} ('{file_name}')...")
    if dry_run:
        log("INFO", f"  [DRY-RUN] Simulado: {label} se subiria y recortaria.")
        return True

    file_input = page.locator(f"input.image-upload[data-image='{img_type}'], #image-{img_type}-select input[type='file']").first
    if file_input.count() == 0:
        log("ERROR", f"No se encontro el selector de archivo para {label}.")
        return False

    try:
        file_input.set_input_files(abs_path)
    except Exception as e:
        log("ERROR", f"Error al asignar archivo para {label}: {e}")
        return False

    try:
        page.wait_for_function("() => (window.$ && $('#modalImageUploadCroppie').data('croppie') !== undefined) || (document.querySelector('#modalImageUpload') && !document.querySelector('#modalImageUpload').classList.contains('d-none'))", timeout=12000)
    except Exception:
        time.sleep(1.0)

    time.sleep(0.6)
    log("INFO", f"Ajustando recorte al tamano completo para {label}...")
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

    clicked = False
    try:
        btn_guardar = page.locator("#modalImageUploadSave, #modalImageUpload button:has-text('Guardar')").first
        if btn_guardar.count() > 0:
            btn_guardar.click(force=True, timeout=4000)
            clicked = True
    except Exception:
        pass

    if not clicked:
        page.evaluate("""() => {
            const btn = document.querySelector('#modalImageUploadSave') || Array.from(document.querySelectorAll('#modalImageUpload button')).find(b => b.innerText.includes('Guardar'));
            if (btn) btn.click();
        }""")

    log("INFO", f"Guardando imagen recortada de {label}...")
    t_wait = time.time()
    while time.time() - t_wait < 25:
        try:
            is_hidden = page.evaluate("() => !document.querySelector('#modalImageUpload') || !$('#modalImageUpload').is(':visible') || $('#modalImageUpload').css('display') === 'none'")
            if is_hidden:
                break
        except Exception:
            break
        time.sleep(0.4)

    log("SUCCESS", f"OK {label} guardada correctamente en QRBoletos.")
    return True

def update_artworks():
    args = parse_args()

    has_tickets = bool((args.digital_image and os.path.exists(args.digital_image)) or (args.print_image and os.path.exists(args.print_image)))
    has_promo = bool((args.image_home and os.path.exists(args.image_home)) or (args.image_afiche and os.path.exists(args.image_afiche)) or (args.image_banner and os.path.exists(args.image_banner)))

    if not has_tickets and not has_promo:
        log("ERROR", "No se especifico ninguna imagen para subir.")
        sys.exit(1)

    log("INFO", f"Conectando a Chrome via CDP en {args.cdp_url}...")
    if args.digital_image:
        log("INFO", f"Arte Digital: {args.digital_image} (Reemplazar={args.replace_images})")
    if args.print_image:
        log("INFO", f"Arte Fisico Boca/Godex: {args.print_image} (Reemplazar={args.replace_images})")
    if args.image_home:
        log("INFO", f"Miniatura: {args.image_home}")
    if args.image_afiche:
        log("INFO", f"Portada: {args.image_afiche}")
    if args.image_banner:
        log("INFO", f"Banner: {args.image_banner}")

    filter_sections = []
    if args.sections_json:
        try:
            filter_sections = [s.strip().upper() for s in json.loads(args.sections_json)]
            log("INFO", f"Filtrando por localidades especificas: {filter_sections}")
        except Exception:
            pass

    with sync_playwright() as p:
        try:
            browser = p.chromium.connect_over_cdp(args.cdp_url)
        except Exception as e:
            log("ERROR", f"No se pudo conectar a Chrome en {args.cdp_url}: {e}")
            sys.exit(1)

        context = browser.contexts[0] if browser.contexts else browser.new_context()
        page = find_or_create_qrboletos_page(context)

        # 1. Subir imagenes promocionales del evento si fueron provistas (Miniatura, Afiche, Banner)
        if has_promo:
            settings_url = f"https://dashboard.qrboletos.com/promoters/{args.promoter_id}/events/{args.event_id}/settings.aspx"
            log("INFO", f"Actualizando imagenes promocionales del evento en: {settings_url}")
            if not args.dry_run:
                safe_goto(page, settings_url, wait_selector="#modalImageUpload")
                time.sleep(1.0)
            promo_images = [
                ("home", args.image_home, "Imagen Miniatura (720x639)"),
                ("afiche", args.image_afiche, "Imagen Portada Vertical (800x800)"),
                ("banner", args.image_banner, "Imagen Portada Horizontal (1950x700)"),
            ]
            for img_type, file_path, label in promo_images:
                if file_path and os.path.exists(file_path):
                    try:
                        upload_event_settings_image(page, img_type, file_path, label, args.dry_run)
                        time.sleep(0.5)
                    except Exception as err:
                        log("WARNING", f"Error subiendo promocional {label}: {err}")

            # Sincronizacion automatica en modulo Banners Web de QRBoletos
            if args.image_banner and os.path.exists(args.image_banner):
                log("INFO", "Sincronizando Portada Horizontal en el modulo de Banners Web de QRBoletos...")
                try:
                    from manage_banners_chrome import sync_event_banner, DEFAULT_BANNERS_URL
                    events_list = []
                    if args.events_json:
                        try:
                            if os.path.exists(args.events_json):
                                with open(args.events_json, "r", encoding="utf-8") as f:
                                    events_list = json.load(f)
                            else:
                                events_list = json.loads(args.events_json)
                        except Exception:
                            pass

                    sync_event_banner(
                        page=page,
                        banners_url=DEFAULT_BANNERS_URL,
                        event_id=args.event_numeric_id or args.event_id,
                        event_name=args.event_name or "Evento",
                        event_url=args.event_url,
                        banner_image_path=args.image_banner,
                        en_venta=args.en_venta,
                        replace_image=args.replace_images,
                        events_list=events_list if events_list else None,
                        dry_run=args.dry_run
                    )
                except Exception as b_err:
                    log("WARNING", f"Error sincronizando en Banners Web: {b_err}")

        # 2. Subir artes de boleteria digital y fisica si fueron provistas
        if has_tickets:
            if not args.show_id:
                log("ERROR", "Se requiere --show-id para actualizar artes de boletos.")
                sys.exit(1)

            sections_url = f"https://dashboard.qrboletos.com/promoters/{args.promoter_id}/events/{args.event_id}/shows/{args.show_id}/sections.aspx"
            log("INFO", f"Navegando a estructura de localidades: {sections_url}")
            safe_goto(page, sections_url, wait_selector="#sections-box, div.card")

            available_sections = extract_sections_from_page(page)
            if not available_sections:
                log("ERROR", "No se encontraron localidades en sections.aspx.")
                sys.exit(1)

            total_prices_processed = 0
            total_artworks_updated = 0

            for sec_name, sec_id in available_sections.items():
                if filter_sections and sec_name not in filter_sections:
                    continue

                sales_url = f"https://dashboard.qrboletos.com/promoters/{args.promoter_id}/events/{args.event_id}/shows/{args.show_id}/sections/{sec_id}/prices/sales.aspx"
                log("INFO", f"Procesando localidad: '{sec_name}' -> {sales_url}")
                safe_goto(page, sales_url, wait_selector="a[href*='/prices/sales/']")
                time.sleep(args.delay_ms / 1000.0)

                prices = extract_price_links_from_sales_page(page)
                log("INFO", f"  Detectados {len(prices)} precios en '{sec_name}'.")

                for price in prices:
                    price_id = price["id"]
                    price_name = price["nombre"]
                    total_prices_processed += 1

                    log("INFO", f"  Configurando artes para precio '{price_name}' (ID: {price_id})...")

                    # Extraer URL limpia del precio
                    price_href = price.get("url") or ""
                    if price_href.startswith("http"):
                        clean_url = re.sub(r'/(settings|designs|extras|poslimit).*$', '', price_href)
                    else:
                        clean_url = f"https://dashboard.qrboletos.com{re.sub(r'/(settings|designs|extras|poslimit).*$', '', price_href)}"
                    clean_url = re.sub(r'\.aspx$', '', clean_url)

                    try:
                        # 1. QRBoleto Digital (1465x550)
                        if args.digital_image and os.path.exists(args.digital_image):
                            settings_url = f"{clean_url}/settings.aspx"
                            if not args.dry_run:
                                safe_goto(page, settings_url, wait_selector="#image-eticket-select, #image-eticket-control")
                                time.sleep(args.delay_ms / 1000.0)
                                del_btn = page.locator("#image-eticket-control-delete, #image-eticket-control .image-delete").first
                                select_btn = page.locator("#image-eticket-select, .btn-file:has(input[data-width-result='1465'])").first
                                should_upload = prepare_image_slot(page, del_btn, select_btn, "QRBoleto Digital (1465x550)", args.replace_images, args.dry_run, args.delay_ms)
                                if should_upload:
                                    digital_input = page.locator("#image-eticket-select input[type='file'], #image-eticket-select input.image-upload, input.image-upload[data-width-result='1465'], input.image-upload").first
                                    ok = handle_image_croppie_upload(page, digital_input, args.digital_image, "QRBoleto Digital (1465x550)", args.dry_run, args.delay_ms)
                                    if ok:
                                        total_artworks_updated += 1
                            else:
                                handle_image_croppie_upload(page, None, args.digital_image, "QRBoleto Digital (1465x550)", args.dry_run, args.delay_ms)
                                total_artworks_updated += 1

                        # 2. Diseno Impresion Fisico 63X177 (Boca y Godex)
                        if args.print_image and os.path.exists(args.print_image):
                            # 2a. Boca
                            boca_url = f"{clean_url}/designs/windows/boca.aspx"
                            log("INFO", f"    Boca (63X177): {boca_url}")
                            if not args.dry_run:
                                safe_goto(page, boca_url, wait_selector="table tr")
                                time.sleep(args.delay_ms / 1000.0)
                                target_row = page.locator("tr").filter(has=page.locator("input.image-upload[data-height='236'][data-width='1134']")).first
                                del_btn = target_row.locator(".image-delete, button[id*='-control-delete']").first
                                select_btn = target_row.locator(".btn-file, span:has-text('Subir imagen')").first
                                should_upload = prepare_image_slot(page, del_btn, select_btn, "Diseno Impresion Boca (63X177)", args.replace_images, args.dry_run, args.delay_ms)
                                if should_upload:
                                    boca_input = target_row.locator("input.image-upload, input[type='file']").first
                                    ok = handle_image_croppie_upload(page, boca_input, args.print_image, "Diseno Impresion Boca (63X177)", args.dry_run, args.delay_ms)
                                    if ok:
                                        total_artworks_updated += 1
                            else:
                                handle_image_croppie_upload(page, None, args.print_image, "Diseno Impresion Boca (63X177)", args.dry_run, args.delay_ms)
                                total_artworks_updated += 1

                            # 2b. Godex (Omitiendo 63X177PP / data-height="590")
                            godex_url = f"{clean_url}/designs/windows/godex.aspx"
                            log("INFO", f"    Godex (63X177): {godex_url}")
                            if not args.dry_run:
                                safe_goto(page, godex_url, wait_selector="table tr")
                                time.sleep(args.delay_ms / 1000.0)
                                target_row = page.locator("tr").filter(has=page.locator("input.image-upload[data-height='236'][data-width='1134']")).first
                                del_btn = target_row.locator(".image-delete, button[id*='-control-delete']").first
                                select_btn = target_row.locator(".btn-file, span:has-text('Subir imagen')").first
                                should_upload = prepare_image_slot(page, del_btn, select_btn, "Diseno Impresion Godex (63X177)", args.replace_images, args.dry_run, args.delay_ms)
                                if should_upload:
                                    godex_input = target_row.locator("input.image-upload, input[type='file']").first
                                    ok = handle_image_croppie_upload(page, godex_input, args.print_image, "Diseno Impresion Godex (63X177)", args.dry_run, args.delay_ms)
                                    if ok:
                                        total_artworks_updated += 1
                            else:
                                handle_image_croppie_upload(page, None, args.print_image, "Diseno Impresion Godex (63X177)", args.dry_run, args.delay_ms)
                                total_artworks_updated += 1

                        log("SUCCESS", f"  Artes actualizados para '{price_name}'.")
                    except Exception as price_err:
                        log("WARNING", f"  Error en artes para '{price_name}': {price_err}")

            log("SUCCESS", f"Proceso de artes finalizado. Precios examinados: {total_prices_processed} | Artes procesados: {total_artworks_updated}")
        else:
            log("SUCCESS", "Proceso finalizado con exito.")

if __name__ == "__main__":
    update_artworks()
