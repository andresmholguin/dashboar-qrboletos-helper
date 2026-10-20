#!/usr/bin/env python3
"""
clone_seats_chrome.py
Automatización para Google Chrome (CDP) que clona las distribuciones de silletería (planos)
para cada localidad de un espectáculo en dashboard.qrboletos.com.

Reglas:
1. Navega a la URL de acomodación de cada sección: .../sections/{section_id}/seats.aspx
2. Si la localidad no tiene distribución (el botón '#clone' / 'Clonar' está visible):
   - Abre el modal 'CLONAR UBICACIONES' (#modalClone).
   - Selecciona Promotor: 'ARECOL SAS' (o que contenga 'ARECOL').
   - Selecciona Evento: 'PLANOS' (o que contenga 'PLANOS').
   - Selecciona Espectáculo: 'PRUEBA' (o que contenga 'PRUEBA').
   - Selecciona Localidad: opción que coincida con el nombre de la sección actual
     (ej. 'PREFERENCIAL 1', 'VIP 3', 'PLATEA', etc. con normalización).
   - Hace clic en 'Guardar'.
   - Espera la recarga / confirmación de guardado.
3. Si la localidad ya cuenta con silletería o plano (no aparece '#clone'):
   - La conserva y reporta que ya tiene distribución.
"""

import sys
import os
import re
import time
import json
import argparse
from typing import Dict, List, Optional
from playwright.sync_api import sync_playwright, Page, BrowserContext

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

def log(level: str, msg: str):
    symbols = {"INFO": "ℹ️ ", "SUCCESS": "✅", "WARNING": "⚠️ ", "ERROR": "❌"}
    sym = symbols.get(level, "•")
    try:
        print(f"[{level}] {sym} {msg}", flush=True)
    except Exception:
        print(f"[{level}] {msg}", flush=True)

def parse_args():
    parser = argparse.ArgumentParser(description="Clonador de planos de silletería vía Chrome CDP")
    parser.add_argument("--cdp-url", default="http://localhost:9222", help="URL de depuración remota de Chrome")
    parser.add_argument("--promoter-id", required=True, help="ID del promotor")
    parser.add_argument("--event-id", required=True, help="ID del evento")
    parser.add_argument("--show-id", required=True, help="ID del espectáculo")
    parser.add_argument("--source-promoter", default="ARECOL", help="Texto del promotor origen (default: ARECOL)")
    parser.add_argument("--source-event", default="PLANOS", help="Texto del evento origen (default: PLANOS)")
    parser.add_argument("--source-show", default="PRUEBA", help="Texto del espectáculo origen (default: PRUEBA)")
    parser.add_argument("--dry-run", action="store_true", help="Simula las acciones sin guardar")
    parser.add_argument("--delay-ms", type=int, default=800, help="Espera entre pasos (ms)")
    return parser.parse_args()

def safe_goto(page: Page, url: str, timeout_ms: int = 30000):
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
    except Exception:
        try:
            page.goto(url, timeout=timeout_ms)
        except Exception:
            pass
    time.sleep(0.5)

def normalize_loc_name(name: str) -> str:
    n = (name or "").upper().strip()
    n = re.sub(r'LOCALIDAD:\s*', '', n)
    n = re.sub(r'MODALIDAD.*$', '', n)
    n = re.sub(r'COLOR.*$', '', n)
    n = re.sub(r'ID:.*$', '', n)
    n = re.sub(r'\bPREF\b', 'PREFERENCIAL', n)
    n = re.sub(r'\s+', ' ', n).strip()
    return n

def find_matching_source_option(target_name: str, options: List[dict]) -> Optional[dict]:
    target_norm = normalize_loc_name(target_name)

    # 1. Coincidencia exacta
    for opt in options:
        opt_text = opt.get("text", "").strip()
        if not opt_text:
            continue
        opt_norm = normalize_loc_name(opt_text)
        if target_norm == opt_norm:
            return opt

    # 2. Coincidencia por número y tipo (ej. VIP 2 y VIP 2, PREF 1 y PREFERENCIAL 1)
    target_nums = re.findall(r'\b\d+\b', target_norm)
    for opt in options:
        opt_text = opt.get("text", "").strip()
        if not opt_text:
            continue
        opt_norm = normalize_loc_name(opt_text)
        opt_nums = re.findall(r'\b\d+\b', opt_norm)
        if target_nums and opt_nums and target_nums == opt_nums:
            if ("VIP" in target_norm and "VIP" in opt_norm) or \
               ("PREFERENCIAL" in target_norm and "PREFERENCIAL" in opt_norm):
                return opt

    # 3. Coincidencia por inclusión
    for opt in options:
        opt_text = opt.get("text", "").strip()
        if not opt_text:
            continue
        opt_norm = normalize_loc_name(opt_text)
        if target_norm in opt_norm or opt_norm in target_norm:
            return opt

    return None

def extract_sections(page: Page) -> Dict[str, str]:
    sections = {}
    try:
        page.wait_for_selector("#sections-box div.card, div.card, .section-item, table", state="attached", timeout=12000)
    except Exception:
        pass

    cards = page.locator("#sections-box div.card, div.card, .section-item")
    count = cards.count()
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
            title_el = card.locator(".card-title, h4, h5, strong").first
            if title_el.count() > 0:
                nombre = title_el.inner_text().strip()

        if nombre and section_id:
            normalized = normalize_loc_name(nombre)
            if normalized not in sections:
                sections[normalized] = section_id

    return sections

def clone_locality_seats(page: Page, section_name: str, seats_url: str, args) -> dict:
    log("INFO", f"📍 Analizando acomodación para '{section_name}'...")
    safe_goto(page, seats_url)
    time.sleep(args.delay_ms / 1000.0)

    # Verificar si el botón '#clone' está presente en la página
    clone_btn = page.locator("#clone, button:has-text('Clonar')").first
    clone_visible = False
    try:
        clone_visible = clone_btn.count() > 0 and clone_btn.is_visible()
    except Exception:
        clone_visible = False

    if not clone_visible:
        # Verificar si ya existe distribución / SVG
        has_svg = page.evaluate("""() => $('svg').length > 0 || $('.seat-item, [id*="seat"]').length > 0""")
        if has_svg:
            log("INFO", f"  ✓ Localidad '{section_name}' ya cuenta con distribución de silletería (plano existente). [CONSERVADA]")
            return {"name": section_name, "status": "already_has_seats"}
        else:
            log("WARNING", f"  ⚠️ No se encontró botón 'Clonar' ni plano en '{section_name}'.")
            return {"name": section_name, "status": "no_clone_button"}

    log("INFO", f"  🎨 Localidad '{section_name}' sin plano asignado. Abriendo modal de clonación...")
    if args.dry_run:
        log("INFO", f"  [DRY-RUN] Se clonaría desde {args.source_promoter} -> {args.source_event} -> {args.source_show} -> '{section_name}'.")
        return {"name": section_name, "status": "cloned_dry_run"}

    # Hacer clic en Clonar
    clone_btn.click()
    modal = page.locator("#modalClone")
    try:
        modal.wait_for(state="visible", timeout=8000)
    except Exception as e:
        log("ERROR", f"  ❌ No se abrió el modal #modalClone: {e}")
        return {"name": section_name, "status": "modal_error"}

    time.sleep(0.5)

    # 1. Seleccionar Promotor (ARECOL SAS)
    step1 = page.evaluate(f"""() => {{
        return new Promise((resolve) => {{
            const lbl = Array.from(document.querySelectorAll('#modalClone label')).find(l => l.innerText.includes('Promotor'));
            if (!lbl) return resolve({{ success: false, error: 'No se encontró etiqueta Promotor' }});
            const sel = document.getElementById(lbl.getAttribute('for'));
            if (!sel) return resolve({{ success: false, error: 'No se encontró select Promotor' }});
            
            const opt = Array.from(sel.options).find(o => o.text.toUpperCase().includes('{args.source_promoter.upper()}'));
            if (!opt) return resolve({{ success: false, error: 'Promotor {args.source_promoter} no encontrado en opciones' }});
            
            let timer = setTimeout(() => resolve({{ success: true, val: opt.value }}), 3000);
            $(document).one('ajaxComplete', () => {{
                clearTimeout(timer);
                setTimeout(() => resolve({{ success: true, val: opt.value }}), 300);
            }});
            $(sel).val(opt.value).trigger('change');
        }});
    }}""")

    if not step1.get("success"):
        log("ERROR", f"  ❌ Paso 1 (Promotor): {step1.get('error')}")
        return {"name": section_name, "status": "step1_error"}

    log("INFO", f"  • Promotor origen seleccionado ({args.source_promoter}).")
    time.sleep(0.8)

    # 2. Seleccionar Evento (PLANOS)
    step2 = page.evaluate(f"""() => {{
        return new Promise((resolve) => {{
            const lbl = Array.from(document.querySelectorAll('#modalClone label')).find(l => l.innerText.includes('Evento'));
            if (!lbl) return resolve({{ success: false, error: 'No se encontró etiqueta Evento' }});
            const sel = document.getElementById(lbl.getAttribute('for'));
            if (!sel) return resolve({{ success: false, error: 'No se encontró select Evento' }});
            
            const opt = Array.from(sel.options).find(o => o.text.toUpperCase().includes('{args.source_event.upper()}'));
            if (!opt) return resolve({{ success: false, error: 'Evento {args.source_event} no encontrado en opciones' }});
            
            let timer = setTimeout(() => resolve({{ success: true, val: opt.value }}), 3000);
            $(document).one('ajaxComplete', () => {{
                clearTimeout(timer);
                setTimeout(() => resolve({{ success: true, val: opt.value }}), 300);
            }});
            $(sel).val(opt.value).trigger('change');
        }});
    }}""")

    if not step2.get("success"):
        log("ERROR", f"  ❌ Paso 2 (Evento): {step2.get('error')}")
        return {"name": section_name, "status": "step2_error"}

    log("INFO", f"  • Evento origen seleccionado ({args.source_event}).")
    time.sleep(0.8)

    # 3. Seleccionar Espectáculo (PRUEBA)
    step3 = page.evaluate(f"""() => {{
        return new Promise((resolve) => {{
            const lbl = Array.from(document.querySelectorAll('#modalClone label')).find(l => l.innerText.includes('Espectáculo') || l.innerText.includes('Espectaculo'));
            if (!lbl) return resolve({{ success: false, error: 'No se encontró etiqueta Espectáculo' }});
            const sel = document.getElementById(lbl.getAttribute('for'));
            if (!sel) return resolve({{ success: false, error: 'No se encontró select Espectáculo' }});
            
            const opt = Array.from(sel.options).find(o => o.text.toUpperCase().includes('{args.source_show.upper()}'));
            if (!opt) return resolve({{ success: false, error: 'Espectáculo {args.source_show} no encontrado en opciones' }});
            
            let timer = setTimeout(() => resolve({{ success: true, val: opt.value }}), 3000);
            $(document).one('ajaxComplete', () => {{
                clearTimeout(timer);
                setTimeout(() => resolve({{ success: true, val: opt.value }}), 300);
            }});
            $(sel).val(opt.value).trigger('change');
        }});
    }}""")

    if not step3.get("success"):
        log("ERROR", f"  ❌ Paso 3 (Espectáculo): {step3.get('error')}")
        return {"name": section_name, "status": "step3_error"}

    log("INFO", f"  • Espectáculo origen seleccionado ({args.source_show}).")
    time.sleep(0.8)

    # 4. Obtener opciones de Localidad y buscar coincidencia
    loc_options = page.evaluate("""() => {
        const lbl = Array.from(document.querySelectorAll('#modalClone label')).find(l => l.innerText.includes('Localidad'));
        if (!lbl) return [];
        const sel = document.getElementById(lbl.getAttribute('for'));
        if (!sel) return [];
        return Array.from(sel.options).map(o => ({ text: o.text.trim(), value: o.value }));
    }""")

    matched_opt = find_matching_source_option(section_name, loc_options)
    if not matched_opt:
        available_names = [o["text"] for o in loc_options if o["text"]]
        log("WARNING", f"  ⚠️ No se encontró plano coincidente para '{section_name}'. Opciones disponibles en PRUEBA: {available_names}")
        # Cerrar modal
        page.evaluate("$('#modalClone').modal('hide');")
        return {"name": section_name, "status": "no_matching_locality"}

    matched_val = matched_opt["value"]
    matched_text = matched_opt["text"]
    log("INFO", f"  • Coincidencia de plano encontrada: '{section_name}' -> '{matched_text}' (ID: {matched_val})")

    page.evaluate(f"""() => {{
        const lbl = Array.from(document.querySelectorAll('#modalClone label')).find(l => l.innerText.includes('Localidad'));
        const sel = document.getElementById(lbl.getAttribute('for'));
        $(sel).val('{matched_val}').trigger('change');
    }}""")
    time.sleep(0.4)

    # 5. Guardar clonación: Ejecutar exactamente 1 solo clic y deshabilitar para evitar duplicados
    log("INFO", f"  💾 Enviando solicitud de clonación (1 solo clic). Bloqueando re-envíos...")

    click_result = page.evaluate("""() => {
        if (window.__clone_already_submitted) {
            return { ok: false, error: 'Ya se envió una solicitud de clonación previa' };
        }
        window.__clone_already_submitted = true;

        // Desactivar tecla Enter en el modal para evitar envíos dobles o triples
        $('#modalClone').off('keydown.preventClone').on('keydown.preventClone', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        });

        // Desactivar envíos duplicados en el form
        $('#modalClone form').off('submit.preventClone').on('submit.preventClone', function(e) {
            if (this.dataset.submitted === 'true') {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
            this.dataset.submitted = 'true';
        });

        // Buscar botón Guardar (amarillo / btn-warning / btn-primary / texto Guardar)
        const allButtons = Array.from(document.querySelectorAll('#modalClone button, #modalClone input[type="submit"]'));
        const btnGuardar = allButtons.find(b => {
            const txt = (b.innerText || b.value || '').trim().toLowerCase();
            return txt.includes('guardar');
        }) || document.querySelector('#modalClone button.btn-primary') || document.querySelector('#modalClone button:not(.close):not(.btn-secondary)');

        if (!btnGuardar) {
            return { ok: false, error: 'No se encontró el botón Guardar en el modal' };
        }

        // Ejecutar exactamente 1 solo clic
        btnGuardar.click();

        // Inmediatamente deshabilitar el botón y cambiar texto para que no reciba más clics ni enters
        try {
            btnGuardar.disabled = true;
            btnGuardar.style.pointerEvents = 'none';
            btnGuardar.style.opacity = '0.6';
            btnGuardar.innerText = 'Guardando... Espere por favor';
            $(btnGuardar).prop('disabled', true).addClass('disabled');
        } catch (e) {}

        return { ok: true };
    }""")

    if not click_result.get("ok"):
        log("ERROR", f"  ❌ Error al disparar guardado: {click_result.get('error')}")
        return {"name": section_name, "status": "save_error"}

    log("INFO", f"  ⏳ Guardado iniciado con 1 solo clic. Esperando a que el servidor de QRBoletos procese la clonación (puede tardar de 15 a 60 segundos)...")

    # Esperar activamente la finalización de la clonación (hasta 90 segundos)
    start_wait = time.time()
    max_wait = 90.0
    confirmed = False

    while (time.time() - start_wait) < max_wait:
        time.sleep(1.5)
        try:
            # 1. Comprobar si apareció la alerta de éxito: "Hemos clonado las ubicaciones satisfactoriamente"
            check = page.evaluate("""() => {
                const bodyText = (document.body ? document.body.innerText : '') || '';
                const hasSuccessMsg = bodyText.includes('Hemos clonado las ubicaciones satisfactoriamente') ||
                                      bodyText.includes('clonado las ubicaciones') ||
                                      bodyText.includes('ubicaciones satisfactoriamente');

                let okClicked = false;
                if (hasSuccessMsg) {
                    // Buscar y pulsar el botón OK en el modal SweetAlert
                    const btns = Array.from(document.querySelectorAll('.swal2-confirm, .sweet-alert button.confirm, .swal-button--confirm, .modal button, button'));
                    const okBtn = btns.find(b => {
                        const t = (b.innerText || b.value || '').trim().toUpperCase();
                        return t === 'OK' || t === 'ACEPTAR' || t.includes('OK');
                    });
                    if (okBtn) {
                        okBtn.click();
                        okClicked = true;
                    } else if (window.Swal && typeof window.Swal.close === 'function') {
                        window.Swal.close();
                        okClicked = true;
                    } else if (window.swal && typeof window.swal.close === 'function') {
                        window.swal.close();
                        okClicked = true;
                    }
                }

                const hasSvg = $('svg').length > 0 || $('.seat-item, [id*="seat"]').length > 0;
                const cloneVisible = $('#clone, button:has-text(\"Clonar\")').is(':visible');
                const modalVisible = $('#modalClone').is(':visible');
                const seatCount = $('.seat-item, [id*="seat"], circle, rect.seat').length;

                return { hasSuccessMsg, okClicked, hasSvg, cloneVisible, modalVisible, seatCount };
            }""")

            # Si detectamos la alerta de éxito
            if check.get("hasSuccessMsg") or check.get("okClicked"):
                log("SUCCESS", f"  🎉 Confirmación detectada en QRBoletos: 'Hemos clonado las ubicaciones satisfactoriamente'.")
                try:
                    ok_loc = page.locator(".swal2-confirm, .sweet-alert button.confirm, button:has-text('OK')").first
                    if ok_loc.count() > 0 and ok_loc.is_visible():
                        ok_loc.click()
                        log("INFO", f"  👉 Botón 'OK' presionado automáticamente.")
                except Exception:
                    pass

                confirmed = True
                log("INFO", f"  🔄 Esperando recarga y renderizado del plano clonado...")
                try:
                    page.wait_for_load_state("domcontentloaded", timeout=15000)
                except Exception:
                    pass
                time.sleep(2.0)
                break

            if check.get("hasSvg") and not check.get("cloneVisible"):
                confirmed = True
                seat_count = check.get("seatCount", 0)
                log("INFO", f"  ✓ Plano detectado en el DOM ({seat_count} asientos confirmados).")
                break
        except Exception:
            # Si el contexto de ejecución fue destruido, significa que QRBoletos hizo location.reload()
            log("INFO", f"  🔄 QRBoletos recargó la página tras clonar. Esperando confirmación de carga...")
            try:
                page.wait_for_load_state("domcontentloaded", timeout=20000)
            except Exception:
                pass
            time.sleep(2.0)

    # Si se confirmó por la alerta de éxito o recarga, asegurar que el plano se visualice
    if confirmed:
        try:
            has_svg = page.evaluate("""() => $('svg').length > 0 || $('.seat-item, [id*="seat"]').length > 0""")
            if not has_svg:
                page.reload()
                page.wait_for_load_state("domcontentloaded", timeout=15000)
                time.sleep(1.5)
        except Exception:
            pass

        log("SUCCESS", f"  ✅ ¡Plano de '{section_name}' clonado exitosamente desde '{matched_text}'!")
        return {"name": section_name, "status": "cloned_success", "source": matched_text}
    else:
        # Última verificación post-espera
        final_check = {}
        try:
            final_check = page.evaluate("""() => {
                const bodyText = (document.body ? document.body.innerText : '') || '';
                const hasSuccessMsg = bodyText.includes('Hemos clonado las ubicaciones satisfactoriamente') ||
                                      bodyText.includes('clonado las ubicaciones');
                return {
                    hasSuccessMsg,
                    hasSvg: $('svg').length > 0 || $('.seat-item, [id*="seat"]').length > 0,
                    cloneVisible: $('#clone, button:has-text(\"Clonar\")').is(':visible')
                };
            }""")
        except Exception:
            pass

        if final_check.get("hasSuccessMsg") or (final_check.get("hasSvg") and not final_check.get("cloneVisible")):
            try:
                ok_loc = page.locator(".swal2-confirm, .sweet-alert button.confirm, button:has-text('OK')").first
                if ok_loc.count() > 0 and ok_loc.is_visible():
                    ok_loc.click()
            except Exception:
                pass
            log("SUCCESS", f"  ✅ ¡Plano de '{section_name}' clonado exitosamente desde '{matched_text}'!")
            return {"name": section_name, "status": "cloned_success", "source": matched_text}
        else:
            log("WARNING", f"  ⚠️ La clonación de '{section_name}' tardó más de {int(max_wait)}s o requiere verificación manual.")
            return {"name": section_name, "status": "timeout", "source": matched_text}

def run_clone():
    args = parse_args()
    log("INFO", f"Iniciando conexión a Chrome vía CDP en {args.cdp_url}...")
    log("INFO", f"Origen configurado: {args.source_promoter} -> {args.source_event} -> {args.source_show}")

    with sync_playwright() as p:
        try:
            browser = p.chromium.connect_over_cdp(args.cdp_url)
        except Exception as e:
            log("ERROR", f"No se pudo conectar a Chrome en {args.cdp_url}: {e}")
            sys.exit(1)

        ctx = browser.contexts[0] if browser.contexts else browser.new_context()
        page = ctx.new_page()

        sections_url = f"https://dashboard.qrboletos.com/promoters/{args.promoter_id}/events/{args.event_id}/shows/{args.show_id}/sections.aspx"
        log("INFO", f"Consultando localidades en: {sections_url}")
        safe_goto(page, sections_url)

        sections = extract_sections(page)
        if not sections:
            log("ERROR", "No se detectaron localidades en sections.aspx.")
            page.close()
            sys.exit(1)

        log("SUCCESS", f"Se detectaron {len(sections)} localidades en el espectáculo.")
        page.close()

    # Procesar cada localidad secuencialmente con una pestaña dedicada
    log("INFO", f"\n=======================================================")
    log("INFO", f"🚀 Iniciando proceso de clonación de planos de acomodación...")
    log("INFO", f"=======================================================\n")

    cloned_count = 0
    preserved_count = 0
    errors_count = 0

    with sync_playwright() as p:
        browser = p.chromium.connect_over_cdp(args.cdp_url)
        ctx = browser.contexts[0] if browser.contexts else browser.new_context()
        page = ctx.new_page()

        try:
            for sec_name, sec_id in sections.items():
                seats_url = f"https://dashboard.qrboletos.com/promoters/{args.promoter_id}/events/{args.event_id}/shows/{args.show_id}/sections/{sec_id}/seats.aspx"
                try:
                    res = clone_locality_seats(page, sec_name, seats_url, args)
                    st = res.get("status")
                    if st in ["cloned_success", "cloned_dry_run"]:
                        cloned_count += 1
                    elif st == "already_has_seats":
                        preserved_count += 1
                    else:
                        errors_count += 1
                except Exception as e:
                    log("ERROR", f"❌ Error procesando acomodación de '{sec_name}': {e}")
                    errors_count += 1
                time.sleep(0.5)
        finally:
            page.close()

    log("INFO", f"\n=======================================================")
    if errors_count == 0:
        log("SUCCESS", "Proceso de clonación de planos finalizado con éxito.")
        log("SUCCESS", f"Resumen: Planos clonados: {cloned_count} | Planos ya existentes conservados: {preserved_count}")
    else:
        log("WARNING", f"Proceso de clonación finalizado con {errors_count} observaciones.")
        log("INFO", f"Resumen: Planos clonados: {cloned_count} | Planos existentes: {preserved_count} | Omitidos/Sin coincidencia: {errors_count}")
    log("INFO", f"=======================================================")

if __name__ == "__main__":
    run_clone()
