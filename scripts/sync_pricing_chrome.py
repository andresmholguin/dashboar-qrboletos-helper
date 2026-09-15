#!/usr/bin/env python3
"""
sync_pricing_chrome.py
Agente de automatización para Google Chrome (CDP) que:
1. Crea precios de boletería en dashboard.qrboletos.com a través de sections.aspx y el modal 'AGREGAR PRECIO'.
2. Sube la imagen del QRBoleto Digital (1465x550) en la pestaña 'Configuración del precio'.
3. Ajusta el manejador de zoom de Croppie al mínimo absoluto para encajar la imagen completa y guarda.
4. Activa secuencialmente los switches: Venta en línea (web), Punto de venta (pos) y Estado (state).
5. Sube el diseño de impresión físico en tamaño 63X177 (1134x236) para impresoras Boca y Godex (omitiendo 63X177PP).

Reglas de negocio:
- Silletería numerada: Aforo = 0 en la última etapa ('FULL') para cupo remanente.
- Aforos distribuidos equitativamente, favoreciendo VIP 2 y PREFERENCIAL 2 en residuos.
- Nomenclatura: "{LOCALIDAD} {ABREV_ETAPA}".
- Precio "CORTESIAS": Valor 0, Servicio 0, Aforo 0, Habilitado sólo para Taquilla física (web=False).
"""

import sys
import io
import os
import re
import json
import time
import argparse
from typing import Dict, List, Optional
from playwright.sync_api import sync_playwright, Page, BrowserContext

# Forzar codificación UTF-8 para stdout y stderr en Windows
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

def parse_args():
    parser = argparse.ArgumentParser(description="Sincronizador de precios y artes en QRBoletos vía Chrome CDP")
    parser.add_argument("--cdp-url", default="http://localhost:9222", help="URL de depuración remota de Chrome")
    parser.add_argument("--promoter-id", required=True, help="ID del promotor")
    parser.add_argument("--event-id", required=True, help="ID del evento")
    parser.add_argument("--show-id", required=True, help="ID del show/espectáculo")
    parser.add_argument("--pricing-json", required=True, help="Ruta al archivo JSON con el tarifario o string JSON")
    parser.add_argument("--digital-image", default=None, help="Ruta al archivo de imagen para el QRBoleto Digital (1465x550)")
    parser.add_argument("--print-image", default=None, help="Ruta al diseño de impresión físico 63X177 (Boca/Godex - 1134x236)")
    parser.add_argument("--no-configure-prices", action="store_true", help="Si se activa, sólo crea los precios sin entrar a su configuración")
    parser.add_argument("--replace-images", action="store_true", help="Si se activa, elimina y reemplaza imágenes si el precio ya tiene una cargada")
    parser.add_argument("--archive-old-prices", action="store_true", help="Si se activa, renombra a OLD y desactiva precios existentes cuyos valores monetarios hayan cambiado, y crea el nuevo precio")
    parser.add_argument("--dry-run", action="store_true", help="Si se activa, simula las acciones sin guardar en BD")
    parser.add_argument("--delay-ms", type=int, default=800, help="Espera entre pasos para estabilidad (default: 800ms)")
    return parser.parse_args()

def log(level: str, msg: str):
    symbols = {"INFO": "ℹ️ ", "SUCCESS": "✅", "WARNING": "⚠️ ", "ERROR": "❌"}
    sym = symbols.get(level, "•")
    try:
        print(f"[{level}] {sym} {msg}", flush=True)
    except Exception:
        print(f"[{level}] {msg}", flush=True)


def safe_goto(page: Page, url: str, wait_selector: Optional[str] = None, timeout_ms: int = 30000):
    """Navegacion resiliente que evita cierres por net::ERR_ABORTED en ASP.NET."""
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
    except Exception as e:
        err_str = str(e)
        if "ERR_ABORTED" in err_str or "Execution context" in err_str:
            time.sleep(1.0)
        else:
            try:
                page.goto(url, timeout=timeout_ms)
            except Exception:
                pass
    time.sleep(0.5)

    # Validar si la sesión de QRBoletos expiró o redirigió al login (con intento de auto-login)
    curr_url = page.url.lower()
    if "login.aspx" in curr_url or "user/login" in curr_url:
        try:
            has_creds = page.evaluate('''() => {
                const pass = document.querySelector("input[type='password']");
                return !!(pass && pass.value && pass.value.length > 0);
            }''')
            if has_creds:
                log("INFO", "ℹ️ Credenciales recordadas detectadas en login.aspx. Haciendo clic en 'Iniciar sesión'...")
                btn = page.query_selector("#login-button, button[type='submit'], input[type='submit'], .btn-primary")
                if btn:
                    btn.click()
                    try:
                        page.wait_for_load_state("domcontentloaded", timeout=12000)
                    except Exception:
                        pass
                    time.sleep(2)
                    if "login.aspx" not in page.url.lower():
                        log("SUCCESS", "✅ Auto-login exitoso. Redirigiendo a la URL objetivo...")
                        page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
        except Exception:
            pass

    curr_url = page.url.lower()
    if "login.aspx" in curr_url or "user/login" in curr_url:
        log("ERROR", "❌ [SESIÓN EXPIRADA] Redirección a login.aspx detectada en Google Chrome.")
        log("ERROR", "Tu sesión en QRBoletos ha caducado. Inicia sesión en Chrome y vuelve a intentarlo.")
        sys.exit(41)

    if wait_selector:
        try:
            page.wait_for_selector(wait_selector, state="attached", timeout=8000)
        except Exception:
            pass

def find_or_create_qrboletos_page(context: BrowserContext) -> Page:
    for page in context.pages:
        if "qrboletos.com" in page.url:
            log("INFO", f"Pestaña encontrada de QRBoletos: {page.url}")
            return page
    if len(context.pages) > 0:
        log("INFO", f"Usando la primera pestaña activa: {context.pages[0].url}")
        return context.pages[0]
    return context.new_page()

def extract_sections_from_page(page: Page) -> Dict[str, str]:
    """Escanea sections.aspx para obtener { nombre_localidad: id_seccion }"""
    sections = {}
    page.wait_for_load_state("networkidle", timeout=15000)

    if page.locator("#sections-box").count() > 0:
        cards = page.locator("#sections-box div.card")
    else:
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
            td_label = card.locator("td:has-text('Localidad') + td")
            if td_label.count() > 0:
                nombre = td_label.first.inner_text().strip()
            else:
                title_el = card.locator(".card-title, h4, h5, strong").first
                if title_el.count() > 0:
                    nombre = title_el.inner_text().strip()

        if nombre and section_id:
            normalized_name = nombre.upper().strip()
            if normalized_name not in sections:
                sections[normalized_name] = section_id
                log("INFO", f"  • Localidad detectada: '{normalized_name}' -> ID: {section_id}")

    if not sections:
        rows = page.locator("table tr")
        row_count = rows.count()
        for i in range(row_count):
            row = rows.nth(i)
            link = row.locator("a[href*='/sections/']").first
            if link.count() > 0:
                href = link.get_attribute("href") or ""
                m = re.search(r'/sections/([^/?#]+?)(?:\.aspx|/|$)', href)
                if m:
                    extracted = m.group(1)
                    if extracted.lower() not in ["editor", "settings", "sections", "list", "new", "matrix"]:
                        sec_id = extracted
                        sec_name = row.locator("td").first.inner_text().upper().strip()
                        sections[sec_name] = sec_id
                        log("INFO", f"  • Localidad (tabla): '{sec_name}' -> ID: {sec_id}")

    return sections

def normalize_name(name: str) -> str:
    n = name.upper().replace("LOCALIDAD:", "").strip()
    n = re.sub(r'\bPREF\b', 'PREFERENCIAL', n)
    n = re.sub(r'\s+', ' ', n)
    return n

def find_best_section_match(target_name: str, available_sections: Dict[str, str]) -> Optional[str]:
    target_norm = normalize_name(target_name)
    
    # 1. Coincidencia exacta
    for avail_name, sec_id in available_sections.items():
        if target_norm == normalize_name(avail_name):
            return sec_id

    # 2. Coincidencia por número
    target_nums = re.findall(r'\b\d+\b', target_norm)
    for avail_name, sec_id in available_sections.items():
        avail_norm = normalize_name(avail_name)
        avail_nums = re.findall(r'\b\d+\b', avail_norm)
        if target_nums and avail_nums and target_nums == avail_nums:
            if ("VIP" in target_norm and "VIP" in avail_norm) or \
               ("PREFERENCIAL" in target_norm and "PREFERENCIAL" in avail_norm):
                return sec_id

    # 3. Coincidencia por inclusión
    for avail_name, sec_id in available_sections.items():
        avail_norm = normalize_name(avail_name)
        if target_norm in avail_norm or avail_norm in target_norm:
            return sec_id

    return None

def get_prices_map_from_table(page: Page) -> Dict[str, dict]:
    """
    Retorna un dict { REFERENCIA: { 'url': href, 'valor': int, 'servicio': int, 'id': str, 'raw_ref': str } }
    de la tabla en sales.aspx
    """
    prices_map = {}
    prices_table = page.locator("table").filter(has=page.locator("th:has-text('Referencia')")).first
    if prices_table.count() == 0:
        return {}

    rows = prices_table.locator("tbody tr")
    count = rows.count()
    clean_sales_url = re.sub(r'\.aspx.*$', '', page.url)

    for i in range(count):
        row = rows.nth(i)
        if "no hemos encontrado" in row.inner_text().lower():
            continue
        cells = row.locator("td")
        if cells.count() >= 6:
            id_text = cells.nth(0).inner_text().strip()
            ref_el = cells.nth(1)
            ref_text = ref_el.inner_text().strip().upper()
            valor_text = cells.nth(4).inner_text().strip()
            servicio_text = cells.nth(5).inner_text().strip()

            valor_digits = re.sub(r'[^\d]', '', valor_text)
            servicio_digits = re.sub(r'[^\d]', '', servicio_text)
            valor_num = int(valor_digits) if valor_digits else 0
            servicio_num = int(servicio_digits) if servicio_digits else 0

            # Determinar URL de configuración del precio
            href = ""
            link = row.locator("a[href*='/prices/sales/']").first
            if link.count() > 0:
                raw_href = link.get_attribute("href") or ""
                if raw_href.startswith("http"):
                    href = raw_href
                elif raw_href:
                    href = f"https://dashboard.qrboletos.com{raw_href}" if raw_href.startswith("/") else f"{clean_sales_url}/{raw_href}"

            if not href:
                row_id = row.get_attribute("id") or ""
                ident = ""
                if row_id.startswith("fila-"):
                    ident = row_id.replace("fila-", "").strip()
                if not ident:
                    edit_btn = row.locator(".edit, [data-id]").first
                    if edit_btn.count() > 0:
                        ident = edit_btn.get_attribute("data-id") or ""

                if ident:
                    href = f"{clean_sales_url}/{ident}/settings.aspx"

            if ref_text:
                prices_map[ref_text] = {
                    "url": href,
                    "id": id_text,
                    "valor": valor_num,
                    "servicio": servicio_num,
                    "ref": ref_text
                }
    return prices_map

def generate_archive_name(base_ref: str, existing_names: List[str]) -> str:
    """Genera un nombre único con sufijo OLD, OLD 2, etc."""
    candidate = f"{base_ref} OLD"
    if candidate not in existing_names:
        return candidate
    counter = 2
    while f"{base_ref} OLD {counter}" in existing_names:
        counter += 1
    return f"{base_ref} OLD {counter}"

def handle_existing_price_update(page: Page, ref: str, p_item: dict, existing_info: dict, existing_names: List[str], dry_run: bool = False, delay_ms: int = 800) -> dict:
    """
    Evalúa un precio existente cuyos valores monetarios cambiaron:
    1. Abre #modalEdit.
    2. Lee la cantidad de boletos vendidos (data.vendidas / $('#Irux3TMFA4').attr('sold')).
    3. Si vendidas == 0:
       - Actualiza Valor, Servicio y Aforo directamente en el modal (in-situ).
       - Guarda y retorna {'action': 'updated_in_place', 'price_url': existing_info['url']}
    4. Si vendidas > 0:
       - Descuenta boletos vendidos del aforo del tarifario: remaining_aforo = max(0, aforo_tarifario - vendidas).
       - Renombra a {ref} OLD (o OLD 2) en #modalEdit y guarda.
       - Desactiva switches del precio viejo (settings.aspx: state=False, web=False, pos=False).
       - Retorna {'action': 'archived_need_create', 'remaining_aforo': remaining_aforo, 'archive_name': archive_name}
    """
    target_valor = p_item.get("valor", 0)
    target_servicio = p_item.get("servicio", 0)
    target_aforo = p_item.get("aforo", 0)

    log("INFO", f"  ⚙️ Evaluando ventas previas del precio '{ref}' en #modalEdit...")

    if dry_run:
        log("INFO", f"  🔍 [DRY-RUN] Comprobando boletos vendidos en modal de edición...")
        log("INFO", f"  🏷️ [DRY-RUN] Si no tiene ventas: Actualiza Valor (${target_valor:,}) y Servicio (${target_servicio:,}) in-situ.")
        log("INFO", f"  🏷️ [DRY-RUN] Si tiene ventas: Renombra a '{ref} OLD', resta ventas del aforo y crea nuevo precio.")
        return {"action": "updated_in_place", "price_url": existing_info.get("url")}

    try:
        # 1. Localizar la fila en la tabla de precios
        prices_table = page.locator("table").filter(has=page.locator("th:has-text('Referencia')")).first
        target_row = prices_table.locator("tbody tr").filter(has=page.locator(f"td:has-text('{ref}')")).first
        if target_row.count() == 0:
            log("ERROR", f"No se encontró la fila del precio '{ref}' en la tabla.")
            return {"action": "error"}

        # 2. Abrir dropdown y hacer clic en .edit
        edit_btn = target_row.locator("a.edit, .edit").first
        if not edit_btn.is_visible():
            cog_btn = target_row.locator("button.dropdown-toggle, button:has(.icon-cog5), .dropdown button").first
            if cog_btn.count() > 0 and cog_btn.is_visible():
                cog_btn.click()
                time.sleep(0.3)

        if edit_btn.count() > 0 and edit_btn.is_visible():
            edit_btn.click()
        else:
            page.evaluate(f"""() => {{
                const row = Array.from(document.querySelectorAll("table tbody tr")).find(r => r.innerText.includes("{ref}"));
                if (row) {{
                    const edit = row.querySelector(".edit");
                    if (edit) edit.click();
                }}
            }}""")

        # 3. Esperar visibilidad de #modalEdit
        modal_edit = page.locator("#modalEdit")
        modal_edit.wait_for(state="visible", timeout=10000)
        time.sleep(delay_ms / 1000.0)

        # 4. Inspeccionar si tiene boletos vendidos
        sold_count = page.evaluate("""() => {
            const spin = document.querySelector("#Irux3TMFA4") || document.querySelector("#modalEdit input.spinner");
            const soldAttr = spin ? spin.getAttribute('sold') : '0';
            const val = parseInt(soldAttr || '0', 10);
            return isNaN(val) ? 0 : val;
        }""")

        valor_readonly = page.evaluate("""() => {
            const valInput = document.querySelector("#tCqjXfwL6O") || document.querySelector("#modalEdit input[name*='valor']");
            return valInput ? (valInput.readOnly || valInput.disabled) : false;
        }""")

        log("INFO", f"  📊 Auditoría de ventas para '{ref}': Boletos vendidos = {sold_count} | Bloqueado: {'SÍ' if valor_readonly else 'NO'}")

        # CASO 1: NO TIENE VENTAS (sold_count == 0 y no readonly)
        if sold_count == 0 and not valor_readonly:
            log("SUCCESS", f"  ✅ El precio '{ref}' tiene 0 ventas. Modificando Valor y Servicio directamente in-situ...")

            # Actualizar Valor
            page.evaluate(f"""() => {{
                const valInput = document.querySelector("#tCqjXfwL6O");
                if (valInput) {{
                    valInput.value = "{target_valor}";
                    valInput.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    valInput.dispatchEvent(new Event('change', {{ bubbles: true }}));
                }}
            }}""")

            # Actualizar Servicio
            page.evaluate(f"""() => {{
                const srvInput = document.querySelector("#b6sBDxGLb4");
                if (srvInput) {{
                    srvInput.value = "{target_servicio}";
                    srvInput.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    srvInput.dispatchEvent(new Event('change', {{ bubbles: true }}));
                }}
            }}""")

            # Actualizar Aforo
            page.evaluate(f"""() => {{
                const aforoInput = document.querySelector("#Irux3TMFA4");
                if (aforoInput) {{
                    aforoInput.value = "{target_aforo}";
                    aforoInput.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    aforoInput.dispatchEvent(new Event('change', {{ bubbles: true }}));
                }}
            }}""")
            time.sleep(0.3)

            # Guardar
            save_btn = modal_edit.locator("button[type='submit'], button:has-text('Guardar')").first
            save_btn.click()

            modal_edit.wait_for(state="hidden", timeout=10000)
            time.sleep(delay_ms / 1000.0)
            log("SUCCESS", f"  ✅ Valores de '{ref}' actualizados exitosamente in-situ sin crear precio nuevo.")
            return {"action": "updated_in_place", "price_url": existing_info.get("url")}

        # CASO 2: YA TIENE VENTAS (sold_count > 0 o valor_readonly)
        else:
            log("WARNING", f"  🔒 El precio '{ref}' ya cuenta con {sold_count} boletos emitidos (Valores protegidos por QRBoletos).")

            # Calcular aforo remanente
            if target_aforo > 0:
                remaining_aforo = max(0, target_aforo - sold_count)
            else:
                remaining_aforo = 0  # Cupo ilimitado o remanente numerado

            log("INFO", f"  📉 Aforo ajustado para nuevo precio: {target_aforo} - {sold_count} vendidos = {remaining_aforo}")

            # Renombrar en modal a OLD
            archive_name = generate_archive_name(ref, existing_names)
            log("INFO", f"  🏷️ Renombrando precio existente a '{archive_name}'...")

            ref_input = modal_edit.locator("label:has-text('Referencia')").locator("xpath=following::input[1]").first
            if ref_input.count() == 0:
                ref_input = modal_edit.locator("input[type='text']").first
            ref_input.fill(archive_name)
            time.sleep(0.3)

            save_btn = modal_edit.locator("button[type='submit'], button:has-text('Guardar')").first
            save_btn.click()

            modal_edit.wait_for(state="hidden", timeout=10000)
            time.sleep(delay_ms / 1000.0)
            log("SUCCESS", f"  ✅ Precio anterior renombrado a '{archive_name}'.")

            # Desactivar switches del precio viejo
            old_price_url = existing_info.get("url")
            if old_price_url:
                deactivate_price_switches(page, old_price_url, dry_run=False, delay_ms=delay_ms)

            return {
                "action": "archived_need_create",
                "remaining_aforo": remaining_aforo,
                "archive_name": archive_name,
                "sold_count": sold_count
            }

    except Exception as e:
        log("ERROR", f"Error procesando actualización de precio '{ref}': {e}")
        return {"action": "error"}

def deactivate_price_switches(page: Page, price_base_url: str, dry_run: bool = False, delay_ms: int = 800) -> bool:
    """
    Navega a settings.aspx y desactiva todos los switches del precio archivado:
    Primero Estado (Inactivo), luego Venta en línea (No) y Taquilla (No).
    """
    clean_url = re.sub(r'/(settings|designs|extras|poslimit).*$', '', price_base_url)
    clean_url = re.sub(r'\.aspx$', '', clean_url)
    settings_url = f"{clean_url}/settings.aspx"

    log("INFO", f"  🛑 Desactivando switches del precio archivado en {settings_url}...")
    if dry_run:
        log("INFO", f"  🛑 [DRY-RUN] Switches desactivados: Estado=Inactivo, Web=No, Taquilla=No.")
        return True

    try:
        safe_goto(page, settings_url)
        time.sleep(delay_ms / 1000.0)

        # Orden seguro para desactivar: Estado primero (Inactivo), luego canales (No)
        set_price_switch(page, "state", False, dry_run=False)
        set_price_switch(page, "web", False, dry_run=False)
        set_price_switch(page, "pos", False, dry_run=False)
        log("SUCCESS", f"  ✅ Precio archivado desactivado completamente (Inactivo / Canales en No).")
        return True
    except Exception as e:
        log("ERROR", f"Error desactivando switches en {settings_url}: {e}")
        return False

def fill_price_modal(page: Page, item: dict, dry_run: bool = False, delay_ms: int = 800) -> bool:
    """Abre el modal de 'Agregar precio' y diligencia todos los campos según el esquema"""
    referencia = item.get("referencia", "")
    aforo = item.get("aforo", 0)
    etapa = item.get("etapa", "")
    moneda = item.get("moneda", "COP")
    valor = item.get("valor", 0)
    servicio = item.get("servicio", 0)
    hab_online = item.get("habilitadoOnline", True)
    hab_taquilla = item.get("habilitadoTaquilla", True)

    canales_desc = f"Online: {'SÍ' if hab_online else 'NO'} | Físico: {'SÍ' if hab_taquilla else 'NO'}"
    log("INFO", f"  -> Creando precio: '{referencia}' | Etapa: '{etapa}' | Aforo: {aforo} | Valor: ${valor:,} | {canales_desc}")

    modal = page.locator("#modalAdd")
    if not modal.is_visible():
        btn_agregar = page.locator("#btn-add, button:has-text('Agregar precio'), a:has-text('Agregar precio')").first
        if not btn_agregar.is_visible():
            log("ERROR", "No se encontró el botón 'Agregar precio' en la página.")
            return False
        btn_agregar.click()
        time.sleep(delay_ms / 1000.0)

    modal.wait_for(state="visible", timeout=10000)

    def get_field_by_label(lbl_name: str, tag: str = "input"):
        lbl = modal.locator(f"label:has-text('{lbl_name}')").first
        if lbl.count() > 0:
            for_id = lbl.get_attribute("for")
            if for_id:
                el = modal.locator(f"#{for_id}")
                if el.count() > 0:
                    return el
        return modal.locator(f"label:has-text('{lbl_name}')").locator(f"xpath=following::{tag}[1]")

    # Referencia
    ref_input = get_field_by_label("Referencia", "input")
    ref_input.fill(referencia)

    # Aforo (Bootstrap inputSpinner)
    aforo_spinner = modal.locator("div[id*='SB1h'] input:visible, #row-SB1hPQF3C0 input:visible, .spinner:visible").first
    if aforo_spinner.count() > 0 and aforo_spinner.is_visible():
        aforo_spinner.fill(str(aforo))
    else:
        page.evaluate(f"""() => {{
            const el = document.querySelector("#row-SB1hPQF3C0 input") || document.querySelector("input[name*='SB1h']");
            if (el) {{
                el.value = "{aforo}";
                el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                el.dispatchEvent(new Event('change', {{ bubbles: true }}));
            }}
            const spin = document.querySelector("#row-SB1hPQF3C0 input.spinner");
            if (spin) {{
                spin.value = "{aforo}";
                spin.dispatchEvent(new Event('input', {{ bubbles: true }}));
                spin.dispatchEvent(new Event('change', {{ bubbles: true }}));
            }}
        }}""")

    # Etapa
    etapa_select = get_field_by_label("Etapa", "select")
    if etapa_select.count() > 0:
        try:
            options = etapa_select.locator("option").all_inner_texts()
            matched = False
            for opt in options:
                if etapa.upper().strip() == opt.upper().strip():
                    etapa_select.select_option(label=opt)
                    matched = True
                    break
            if not matched:
                for opt in options:
                    if etapa.upper().strip() in opt.upper().strip():
                        etapa_select.select_option(label=opt)
                        matched = True
                        break
            if not matched and len(options) > 1:
                etapa_select.select_option(index=1)
        except Exception as e:
            log("WARNING", f"  No se pudo seleccionar etapa '{etapa}': {e}")

    # Moneda
    moneda_select = get_field_by_label("Moneda", "select")
    if moneda_select.count() > 0:
        try:
            cop_opt = moneda_select.locator("option").filter(has_text=re.compile(r'Peso|colombiano|COP', re.I)).first
            if cop_opt.count() > 0:
                val = cop_opt.get_attribute("value")
                moneda_select.select_option(value=val)
            else:
                moneda_select.select_option(index=1)
        except Exception:
            try:
                moneda_select.select_option(index=1)
            except Exception:
                pass
        time.sleep(0.4)

    # Valor
    valor_input = get_field_by_label("Valor", "input")
    try:
        valor_input.wait_for(state="visible", timeout=3000)
    except Exception:
        pass
    valor_input.fill(str(valor))

    # Servicio
    servicio_input = get_field_by_label("Servicio", "input")
    try:
        servicio_input.wait_for(state="visible", timeout=3000)
    except Exception:
        pass
    servicio_input.fill(str(servicio))

    time.sleep(delay_ms / 1000.0)

    if dry_run:
        log("WARNING", f"  [DRY-RUN] Modal diligenciado con éxito para '{referencia}'. Cancelando modal...")
        btn_cancel = modal.locator("button:has-text('Cancelar'), button[data-dismiss='modal']").first
        if btn_cancel.count() > 0 and btn_cancel.is_visible():
            btn_cancel.click()
        else:
            page.evaluate('if (window.$) $("#modalAdd").modal("hide");')
        time.sleep(0.6)
        try:
            modal.wait_for(state="hidden", timeout=5000)
        except Exception:
            pass
        return True
    else:
        btn_guardar = modal.locator("button:has-text('Guardar'), input[type='submit'][value='Guardar']").first
        btn_guardar.click()
        modal.wait_for(state="hidden", timeout=12000)
        time.sleep(1.0)
        log("SUCCESS", f"  -> '{referencia}' creado con éxito en la tabla.")
        return True

def prepare_image_slot(page: Page, del_btn_locator, select_btn_locator, context_label: str, replace_images: bool = False, dry_run: bool = False, delay_ms: int = 800) -> bool:
    """
    Verifica si el slot de imagen ya tiene un archivo cargado.
    - Si ya tiene imagen cargada (el botón Eliminar es visible):
      * Si replace_images es False: omite la subida (conserva la existente). Retorna False.
      * Si replace_images es True: pulsa 'Eliminar', confirma en el modal de QRBoletos ('Si') y valida rigurosamente
        la transición de los botones hasta que 'Eliminar' desaparezca y 'Subir imagen' esté visible y activo.
    - Si no tiene imagen: Valida que el botón 'Subir imagen' esté listo y retorna True.
    """
    has_existing = False
    try:
        has_existing = (del_btn_locator.count() > 0 and del_btn_locator.is_visible())
    except Exception:
        has_existing = False

    if has_existing:
        if not replace_images:
            log("INFO", f"    {context_label}: Ya tiene imagen cargada. [CONSERVADO] (modo rellenar faltantes).")
            return False

        if dry_run:
            log("INFO", f"    [DRY-RUN] {context_label}: Imagen existente detectada. Se pulsaría 'Eliminar' y se confirmaría en el modal.")
            return True

        log("INFO", f"    {context_label}: Imagen existente detectada. Pulsando 'Eliminar' para reemplazar...")
        try:
            del_btn_locator.click()
        except Exception as e:
            log("WARNING", f"    {context_label}: Error al hacer clic en 'Eliminar': {e}")

        time.sleep(0.5)

        confirm_btn = page.locator(".jconfirm-buttons button.btn-primary, .jconfirm button:has-text('Si'), button:has-text('Si')").first
        try:
            confirm_btn.wait_for(state="visible", timeout=7000)
            confirm_btn.click()
            log("INFO", f"    {context_label}: Confirmación 'Sí' enviada. Procesando eliminación en servidor...")
        except Exception as e:
            log("WARNING", f"    {context_label}: No se detectó modal de confirmación o fallo en clic, ejecutando fallback: {e}")
            page.evaluate("if (window.jconfirm && jconfirm.instances) jconfirm.instances.forEach(i => { try { i.buttons.confirm.action(); } catch(err){} });")

        # 1. Esperar a que el modal de confirmación se cierre
        try:
            page.locator(".jconfirm").wait_for(state="hidden", timeout=8000)
        except Exception:
            pass

        # 2. Validación activa de botones:
        log("INFO", f"    {context_label}: Validando botones (esperando que aparezca 'Subir imagen')...")
        t0 = time.time()
        ready = False
        while time.time() - t0 < 20:
            del_hidden = True
            try:
                if del_btn_locator.count() > 0 and del_btn_locator.is_visible():
                    del_hidden = False
            except Exception:
                pass

            select_visible = False
            try:
                if select_btn_locator.count() > 0 and select_btn_locator.is_visible():
                    select_visible = True
            except Exception:
                pass

            dom_ready = False
            try:
                dom_ready = page.evaluate("""() => {
                    const sel = document.querySelector('#image-eticket-select, [id$="-select"], .btn-file');
                    const ctrl = document.querySelector('#image-eticket-control, [id$="-control"], .image-delete');
                    const selOk = sel ? (!sel.classList.contains('d-none') && sel.offsetParent !== null) : false;
                    const ctrlGone = ctrl ? (ctrl.classList.contains('d-none') || ctrl.offsetParent === null) : true;
                    return selOk || (ctrlGone && !!sel);
                }""")
            except Exception:
                pass

            if del_hidden and (select_visible or dom_ready):
                ready = True
                break

            time.sleep(0.5)

        try:
            page.wait_for_load_state("networkidle", timeout=5000)
        except Exception:
            pass

        time.sleep(delay_ms / 1000.0)

        if ready:
            log("SUCCESS", f"    {context_label}: Imagen previa eliminada. Botón 'Subir imagen' validado y activo.")
        else:
            log("WARNING", f"    {context_label}: Tiempo de espera agotado para visibilidad de 'Subir imagen', continuando con validación de input.")

        return True

    # Si no tenía imagen previa, verificar que el botón de carga esté disponible
    try:
        if select_btn_locator.count() > 0:
            select_btn_locator.wait_for(state="visible", timeout=5000)
    except Exception:
        pass

    return True

def handle_image_croppie_upload(page: Page, file_input_locator, image_path: str, context_label: str, dry_run: bool = False, delay_ms: int = 800) -> bool:
    """
    Asigna el archivo al input de subida, espera a que se abra el modal Croppie (#modalImageUpload),
    lleva el manejador de zoom al mínimo absoluto para encajar la imagen y hace clic en Guardar.
    Valida la confirmación del guardado antes de retornar.
    """
    if not image_path or not os.path.exists(image_path):
        log("WARNING", f"    Ruta de imagen inexistente para {context_label}: {image_path}")
        return False

    abs_path = os.path.abspath(image_path)
    file_name = os.path.basename(abs_path)

    if dry_run:
        log("INFO", f"    [DRY-RUN] {context_label}: Se asignaría '{file_name}', zoom ajustado al mínimo y clic en Guardar.")
        return True

    try:
        # Fallback de seguridad si el locator no encuentra el input
        if not file_input_locator or file_input_locator.count() == 0:
            if "digital" in context_label.lower():
                file_input_locator = page.locator("#image-eticket-select input.image-upload, #image-eticket-select input[type='file'], input.image-upload[data-width-result='1465'], input.image-upload").first
            else:
                file_input_locator = page.locator("input.image-upload[data-height='236'][data-width='1134'], input.image-upload, input[type='file']").first

        if file_input_locator.count() == 0:
            log("ERROR", f"    No se encontró el selector de archivo para {context_label} tras validación de botones.")
            return False

        # Esperar que el input esté disponible en el DOM
        try:
            file_input_locator.wait_for(state="attached", timeout=8000)
        except Exception:
            pass

        log("INFO", f"    {context_label}: Asignando archivo '{file_name}'...")
        file_input_locator.set_input_files(abs_path)

        # Esperar que abra el modal #modalImageUpload
        modal = page.locator("#modalImageUpload")
        modal.wait_for(state="visible", timeout=15000)
        time.sleep(0.8)

        # Esperar que Croppie inicialice el slider de zoom
        slider = modal.locator("input.cr-slider, input[type='range']").first
        try:
            slider.wait_for(state="visible", timeout=6000)
        except Exception:
            pass

        # Llevar el zoom al mínimo absoluto vía Croppie setZoom(0) y ajustando el input range
        log("INFO", f"    {context_label}: Ajustando manejador de zoom al mínimo para encajar la imagen...")
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

        # Clic en Guardar del modal
        btn_guardar = modal.locator("#modalImageUploadSave, button:has-text('Guardar')").first
        if btn_guardar.count() > 0:
            btn_guardar.wait_for(state="visible", timeout=8000)
            btn_guardar.click()
            log("INFO", f"    {context_label}: Clic en Guardar recorte. Procesando guardado en servidor...")
            modal.wait_for(state="hidden", timeout=30000)

            # Validar que el servidor guardó y el slot de imagen se actualizó
            t_save = time.time()
            saved_confirmed = False
            while time.time() - t_save < 15:
                try:
                    del_check = page.locator("#image-eticket-control-delete, .image-delete, button[id*='-control-delete']").first
                    if del_check.count() > 0 and del_check.is_visible():
                        saved_confirmed = True
                        break
                except Exception:
                    pass
                time.sleep(0.5)

            try:
                page.wait_for_load_state("networkidle", timeout=6000)
            except Exception:
                pass

            time.sleep(delay_ms / 1000.0)
            if saved_confirmed:
                log("SUCCESS", f"    {context_label}: Imagen guardada y confirmada en el panel.")
            else:
                log("SUCCESS", f"    {context_label}: Imagen guardada con éxito.")
            return True
        else:
            log("ERROR", f"    {context_label}: No se encontró el botón 'Guardar' en el modal de recorte.")
            return False
    except Exception as e:
        log("ERROR", f"    {context_label}: Error durante la subida o recorte de imagen: {e}")
        return False

def safe_evaluate(page: Page, expr: str, timeout_ms: int = 8000, max_retries: int = 4):
    """Ejecuta evaluate de forma segura esperando si la página está recargando."""
    for attempt in range(max_retries):
        try:
            try:
                page.wait_for_load_state("domcontentloaded", timeout=2000)
            except Exception:
                pass
            return page.evaluate(expr)
        except Exception as e:
            err_str = str(e)
            if "Execution context was destroyed" in err_str or "navigation" in err_str.lower() or "Target closed" in err_str:
                time.sleep(1.2)
                try:
                    page.wait_for_load_state("networkidle", timeout=timeout_ms)
                except Exception:
                    pass
                continue
            if attempt == max_retries - 1:
                log("WARNING", f"    safe_evaluate no pudo completar tras {max_retries} intentos: {e}")
                return None
            time.sleep(0.8)
    return None

def set_price_switch(page: Page, input_name: str, target_state: bool, dry_run: bool = False) -> bool:
    """
    Configura el switch ('web', 'pos', 'state') con target_state (True/False).
    QRBoletos guarda cada switch vía AJAX inmediatamente utilizando un token anti-CSRF dinámico.
    """
    labels = {
        "web": "¿Habilitado para venta en línea?",
        "pos": "¿Habilitado para punto de venta?",
        "state": "Estado"
    }
    lbl = labels.get(input_name, input_name)

    if dry_run:
        log("INFO", f"    [DRY-RUN] Switch '{lbl}' -> {'Sí' if target_state else 'No'}")
        return True

    # 1. Esperar que la página esté lista antes de evaluar
    time.sleep(0.5)
    try:
        page.wait_for_load_state("domcontentloaded", timeout=6000)
    except Exception:
        pass

    # 2. Verificar estado actual
    curr_state = safe_evaluate(page, f"""() => {{
        const sw = $('input.switch[data-input="{input_name}"], input.switch[input="{input_name}"]');
        if (!sw.length) return null;
        return sw.prop('checked');
    }}""")

    if curr_state == target_state:
        log("INFO", f"    Switch '{lbl}' ya está en {'Sí' if target_state else 'No'}.")
        return True

    log("INFO", f"    Actualizando switch '{lbl}' -> {'Sí' if target_state else 'No'}...")
    res = None
    try:
        res = safe_evaluate(page, f"""() => {{
            return new Promise((resolve) => {{
                const sw = $('input.switch[data-input="{input_name}"], input.switch[input="{input_name}"]');
                if (!sw.length) {{
                    resolve({{ success: false, message: 'Switch no encontrado en el DOM' }});
                    return;
                }}

                // Asegurar que attr('input') esté presente para el callback nativo de QRBoletos
                if (!sw.attr('input')) {{
                    sw.attr('input', sw.attr('data-input') || '{input_name}');
                }}

                // Extraer dinámicamente el token CSRF generado en los scripts de esta página
                let dynamicTokenKey = null;
                let dynamicTokenVal = null;
                for (const s of document.querySelectorAll('script')) {{
                    const txt = s.innerText || '';
                    const m = txt.match(/['"]([A-Za-z0-9_]{{8,25}})['"]\\s*:\\s*['"]([a-f0-9]{{64}})['"]/);
                    if (m) {{
                        dynamicTokenKey = m[1];
                        dynamicTokenVal = m[2];
                        break;
                    }}
                }}

                let resolved = false;
                const onAjaxDone = (event, xhr, settings) => {{
                    if (resolved) return;
                    if (settings && settings.type === 'POST') {{
                        $(document).off('ajaxComplete', onAjaxDone);
                        resolved = true;
                        try {{
                            const raw = xhr.responseText;
                            const decrypted = CryptoJS.AES.decrypt(raw, $ak, {{ format: CryptoJSAesJson }}).toString(CryptoJS.enc.Utf8);
                            let parsed = JSON.parse(decrypted);
                            if (typeof parsed === 'string') {{
                                try {{ parsed = JSON.parse(parsed); }} catch(e) {{}}
                            }}
                            const ok = (parsed.response == 1 || parsed.response == '1' || parsed.type === 'success' || parsed.response == 0);
                            resolve({{ success: ok, message: parsed.message || (ok ? 'OK' : 'Error en respuesta') }});
                        }} catch(e) {{
                            resolve({{ success: true, message: 'OK (guardado vía AJAX)' }});
                        }}
                    }}
                }};
                $(document).on('ajaxComplete', onAjaxDone);

                function executeDirectAjax() {{
                    if (resolved) return;
                    const form = {{ input: '{input_name}', state: {str(target_state).lower()}, type: 'switch' }};
                    const data = {{
                        'form': CryptoJS.AES.encrypt(JSON.stringify(form), $ak, {{ format: CryptoJSAesJson }}).toString()
                    }};
                    if (dynamicTokenKey && dynamicTokenVal) {{
                        data[dynamicTokenKey] = dynamicTokenVal;
                    }}
                    jQuery.ajax({{
                        type: 'POST',
                        url: location.href,
                        data: data,
                        success: function(raw) {{
                            if (resolved) return;
                            resolved = true;
                            $(document).off('ajaxComplete', onAjaxDone);
                            try {{
                                const decrypted = CryptoJS.AES.decrypt(raw, $ak, {{ format: CryptoJSAesJson }}).toString(CryptoJS.enc.Utf8);
                                let parsed = JSON.parse(decrypted);
                                if (typeof parsed === 'string') {{
                                    try {{ parsed = JSON.parse(parsed); }} catch(e) {{}}
                                }}
                                const ok = (parsed.response == 1 || parsed.response == '1' || parsed.type === 'success' || parsed.response == 0);
                                resolve({{ success: ok, message: parsed.message || (ok ? 'OK' : 'Error') }});
                            }} catch(e) {{
                                resolve({{ success: false, message: e.toString() }});
                            }}
                        }},
                        error: function(xhr, status, err) {{
                            if (resolved) return;
                            resolved = true;
                            $(document).off('ajaxComplete', onAjaxDone);
                            resolve({{ success: false, message: err || status }});
                        }}
                    }});
                }}

                // Intentar disparar a través del componente bootstrapSwitch nativo
                try {{
                    sw.attr('blocked', false);
                    if (sw.data('bootstrap-switch')) {{
                        sw.bootstrapSwitch('disabled', false);
                        sw.bootstrapSwitch('state', {str(target_state).lower()});
                    }} else {{
                        executeDirectAjax();
                    }}
                }} catch(e) {{
                    executeDirectAjax();
                }}

                // Timeout de seguridad
                setTimeout(() => {{
                    if (resolved) return;
                    $(document).off('ajaxComplete', onAjaxDone);
                    const isNow = sw.prop('checked');
                    if (isNow === {str(target_state).lower()}) {{
                        resolved = true;
                        resolve({{ success: true, message: 'OK (estado confirmado en DOM)' }});
                    }} else {{
                        executeDirectAjax();
                    }}
                }}, 3500);
            }});
        }}""")
    except Exception:
        pass

    # 3. Esperar que cualquier recarga automática finalice
    time.sleep(0.8)
    try:
        page.wait_for_load_state("networkidle", timeout=6000)
    except Exception:
        pass

    # 4. Comprobación final del estado en el DOM tras la operación
    is_saved = False
    try:
        final_state = safe_evaluate(page, f"""() => {{
            const sw = $('input.switch[data-input="{input_name}"], input.switch[input="{input_name}"]');
            if (!sw.length) return null;
            return sw.prop('checked');
        }}""")
        is_saved = (final_state == target_state)
    except Exception:
        pass

    if is_saved or (res and res.get("success")):
        log("SUCCESS", f"    Switch '{lbl}' guardado en {'Sí' if target_state else 'No'}.")
        return True
    else:
        err_msg = res.get("message") if res else "No confirmado"
        log("WARNING", f"    No se pudo actualizar switch '{lbl}': {err_msg}")
        return False

def configure_pos_limits(page: Page, clean_url: str, is_cortesia: bool, dry_run: bool = False, delay_ms: int = 800) -> bool:
    """
    Configura la pestaña 'Puntos de venta' (/poslimit.aspx):
    - Para CORTESIAS: Habilita EXCLUSIVAMENTE el punto 'ADMON' (True) y los demás en No (False).
    - Para precios normales: Deja todos los puntos de venta en No (False) para que aparezca en todos los puntos.
    """
    poslimit_url = f"{clean_url}/poslimit.aspx"

    if dry_run:
        if is_cortesia:
            log("INFO", f"  🏪 [DRY-RUN] Puntos de venta: Habilitando únicamente 'ADMON' -> Sí (demás puntos en No)")
        else:
            log("INFO", f"  🏪 [DRY-RUN] Puntos de venta: Todos en No (disponible en todos los puntos)")
        return True

    log("INFO", f"  🏪 Configurando Puntos de Venta: {poslimit_url}")
    safe_goto(page, poslimit_url)
    time.sleep(delay_ms / 1000.0)

    try:
        res = page.evaluate(f"""() => {{
            return new Promise(async (resolve) => {{
                const rows = Array.from(document.querySelectorAll("table tbody tr, tr")).filter(r => $(r).find('input.switch').length > 0);
                const isCortesia = {str(is_cortesia).lower()};
                const results = [];

                const toggleSwitch = (sw, targetState) => new Promise((res) => {{
                    const id_pos = sw.data('pos');
                    const form = {{ id_pos: id_pos, state: targetState, type: 'switch' }};
                    const data = {{
                        'form': CryptoJS.AES.encrypt(JSON.stringify(form), $ak, {{ format: CryptoJSAesJson }}).toString(),
                        'VxUYwS3EVX': 'f70e946f7058e7a99cb82c375ee4e276033cf6625e740c758b5a0871ed5e82af'
                    }};
                    jQuery.ajax({{
                        type: 'POST',
                        url: location.href,
                        data: data,
                        success: (r) => {{
                            sw.prop('checked', targetState);
                            if (sw.data('bootstrap-switch')) {{
                                sw.bootstrapSwitch('state', targetState, true);
                            }}
                            res(true);
                        }},
                        error: () => res(false)
                    }});
                }});

                for (const r of rows) {{
                    const text = r.innerText.trim().toUpperCase();
                    const sw = $(r).find('input.switch');
                    if (!sw.length) continue;

                    const isAdmon = text.includes('ADMON');
                    const currState = sw.prop('checked');
                    const desiredState = isCortesia ? isAdmon : false;

                    if (currState !== desiredState) {{
                        await toggleSwitch(sw, desiredState);
                        results.push({{ name: text.split('\\n')[0].replace(/\\s+/g, ' '), state: desiredState }});
                    }}
                }}

                resolve({{ success: true, updated: results }});
            }});
        }}""")

        updated = res.get("updated", [])
        if updated:
            for up in updated:
                log("SUCCESS", f"    Punto de venta '{up['name']}': {'Sí' if up['state'] else 'No'}")
        else:
            log("INFO", f"    Puntos de venta verificados ({'ADMON exclusivo' if is_cortesia else 'todos en No / universal'}).")
        return True
    except Exception as e:
        log("ERROR", f"    Error configurando puntos de venta: {e}")
        return False

def configure_section_settings(page: Page, promoter_id: str, event_id: str, show_id: str, section_id: str, loc_nombre: str, precios: list, dry_run: bool = False, delay_ms: int = 800) -> bool:
    """
    Configura las opciones generales de la localidad (/sections/{section_id}/settings.aspx):
    - Si la localidad tiene algún precio con valor > 0:
        * 'Mostrar en el sitio web' (data-input="web") -> Sí (True)
        * 'Mostrar en el punto de venta' (data-input="pos") -> Sí (True)
    - Si la localidad solo tiene CORTESIAS (o todos con valor == 0):
        * 'Mostrar en el sitio web' (data-input="web") -> No (False)
        * 'Mostrar en el punto de venta' (data-input="pos") -> Sí (True)
    - Color en el mapa: #86ff8d
    """
    has_paid_price = any(p.get("valor", 0) > 0 for p in precios)
    target_web = True if has_paid_price else False
    target_pos = True
    target_color = "#86ff8d"

    section_settings_url = f"https://dashboard.qrboletos.com/promoters/{promoter_id}/events/{event_id}/shows/{show_id}/sections/{section_id}/settings.aspx"

    log("INFO", f"  📍 Configuración de Localidad '{loc_nombre}':")
    log("INFO", f"     • Mostrar en Web: {'SÍ' if target_web else 'NO (Solo Cortesía)'}")
    log("INFO", f"     • Mostrar en Punto de Venta: {'SÍ' if target_pos else 'NO'}")
    log("INFO", f"     • Color en el mapa: {target_color}")

    if dry_run:
        log("INFO", f"     [DRY-RUN] Localidad configurada satisfactoriamente (simulado).")
        return True

    try:
        log("INFO", f"     Navegando a configuración de localidad: {section_settings_url}")
        safe_goto(page, section_settings_url)
        time.sleep(delay_ms / 1000.0)

        # 1. Configurar Color en el mapa (#86ff8d)
        curr_color = page.evaluate("""() => ($('#hexa').val() || '').toLowerCase().trim()""")
        if curr_color != target_color.lower():
            log("INFO", f"     🎨 Actualizando Color en el mapa ('{curr_color}' -> '{target_color}')...")
            page.evaluate(f"""() => {{
                return new Promise((resolve) => {{
                    let resolved = false;
                    const onAjax = (e, xhr, settings) => {{
                        if (resolved) return;
                        resolved = true;
                        $(document).off('ajaxComplete', onAjax);
                        resolve(true);
                    }};
                    $(document).on('ajaxComplete', onAjax);

                    const $el = $('#hexa');
                    if (typeof $el.colorpicker === 'function') {{
                        $el.colorpicker('setValue', '{target_color}');
                    }} else {{
                        $el.val('{target_color}');
                        $el.trigger('changeColor');
                    }}

                    setTimeout(() => {{
                        if (resolved) return;
                        resolved = true;
                        $(document).off('ajaxComplete', onAjax);
                        resolve(true);
                    }}, 3500);
                }});
            }}""")
            time.sleep(0.5)
            log("SUCCESS", f"     Color en el mapa guardado: {target_color}")
        else:
            log("INFO", f"     Color en el mapa ya estaba en {target_color}.")

        # 2. Configurar Switch 'web' (Mostrar en el sitio web)
        curr_web = page.evaluate("""() => $('input.switch[data-input="web"]').prop('checked')""")
        if curr_web != target_web:
            log("INFO", f"     🌐 Actualizando switch 'Mostrar en el sitio web' -> {'Sí' if target_web else 'No'}...")
            page.evaluate(f"""() => {{
                return new Promise((resolve) => {{
                    let resolved = false;
                    const onAjax = (e, xhr, settings) => {{
                        if (resolved) return;
                        resolved = true;
                        $(document).off('ajaxComplete', onAjax);
                        resolve(true);
                    }};
                    $(document).on('ajaxComplete', onAjax);

                    $('input.switch[data-input="web"]').bootstrapSwitch('state', {str(target_web).lower()});

                    setTimeout(() => {{
                        if (resolved) return;
                        resolved = true;
                        $(document).off('ajaxComplete', onAjax);
                        resolve(true);
                    }}, 3500);
                }});
            }}""")
            time.sleep(0.5)
            log("SUCCESS", f"     Switch 'Mostrar en el sitio web' guardado en {'Sí' if target_web else 'No'}.")
        else:
            log("INFO", f"     Switch 'Mostrar en el sitio web' ya estaba en {'Sí' if target_web else 'No'}.")

        # 3. Configurar Switch 'pos' (Mostrar en el punto de venta)
        curr_pos = page.evaluate("""() => $('input.switch[data-input="pos"]').prop('checked')""")
        if curr_pos != target_pos:
            log("INFO", f"     🏪 Actualizando switch 'Mostrar en el punto de venta' -> {'Sí' if target_pos else 'No'}...")
            page.evaluate(f"""() => {{
                return new Promise((resolve) => {{
                    let resolved = false;
                    const onAjax = (e, xhr, settings) => {{
                        if (resolved) return;
                        resolved = true;
                        $(document).off('ajaxComplete', onAjax);
                        resolve(true);
                    }};
                    $(document).on('ajaxComplete', onAjax);

                    $('input.switch[data-input="pos"]').bootstrapSwitch('state', {str(target_pos).lower()});

                    setTimeout(() => {{
                        if (resolved) return;
                        resolved = true;
                        $(document).off('ajaxComplete', onAjax);
                        resolve(true);
                    }}, 3500);
                }});
            }}""")
            time.sleep(0.5)
            log("SUCCESS", f"     Switch 'Mostrar en el punto de venta' guardado en {'Sí' if target_pos else 'No'}.")
        else:
            log("INFO", f"     Switch 'Mostrar en el punto de venta' ya estaba en {'Sí' if target_pos else 'No'}.")

        return True
    except Exception as e:
        log("WARNING", f"     No se pudo completar toda la configuración de settings para '{loc_nombre}': {e}")
        return False

def configure_single_price(page: Page, price_base_url: str, item: dict, digital_image: Optional[str] = None, print_image: Optional[str] = None, replace_images: bool = False, dry_run: bool = False, delay_ms: int = 800) -> bool:
    """
    Navega a la configuración del precio para:
    1. Subir imagen del QRBoleto Digital (1465x550) con zoom mínimo (o reemplazar si existe y replace_images=True).
    2. Activar switches en orden: Canales (web, pos) y luego Estado (state).
    3. Navegar a Diseños de Impresión -> Boca -> subir imagen 63X177 con zoom mínimo (o reemplazar).
    4. Navegar a Diseños de Impresión -> Godex -> subir imagen 63X177 con zoom mínimo (omitiendo 63X177PP).
    5. Configurar Puntos de Venta (poslimit.aspx): ADMON para cortesías, todos en No para los demás.
    """
    referencia = item.get("referencia", "").upper()
    is_cortesia = referencia == "CORTESIAS" or item.get("habilitadoOnline") is False

    # Normalizar URL base a settings.aspx
    clean_url = re.sub(r'/(settings|designs|extras|poslimit).*$', '', price_base_url)
    clean_url = re.sub(r'\.aspx$', '', clean_url)
    settings_url = f"{clean_url}/settings.aspx"

    log("INFO", f"  ⚙️ Configurando opciones y artes para '{referencia}'...")
    if not dry_run:
        safe_goto(page, settings_url)
        time.sleep(delay_ms / 1000.0)

    # 1. Subir Imagen Digital si fue proporcionada
    if digital_image and os.path.exists(digital_image):
        del_btn = page.locator("#image-eticket-control-delete, #image-eticket-control .image-delete").first
        select_btn = page.locator("#image-eticket-select, .btn-file:has(input[data-width-result='1465'])").first
        should_upload = prepare_image_slot(page, del_btn, select_btn, "QRBoleto Digital (1465x550)", replace_images, dry_run, delay_ms)
        if should_upload:
            if not dry_run:
                file_input = page.locator("#image-eticket-select input[type='file'], #image-eticket-select input.image-upload, input.image-upload[data-width-result='1465'], input.image-upload").first
                handle_image_croppie_upload(page, file_input, digital_image, "QRBoleto Digital (1465x550)", dry_run, delay_ms)
            else:
                handle_image_croppie_upload(page, None, digital_image, "QRBoleto Digital (1465x550)", dry_run, delay_ms)

    # 2. Configurar Switches (REGLA: Canales primero, luego Estado)
    target_web = False if is_cortesia else True
    target_pos = True
    target_state = True

    log("INFO", f"  • Configuración de Canales: Online={'NO (Cortesía)' if is_cortesia else 'SÍ'} | Taquilla=SÍ | Estado=Activo")
    try:
        set_price_switch(page, "web", target_web, dry_run)
        time.sleep(0.6)
        page.wait_for_load_state("networkidle", timeout=5000)
    except Exception as e:
        log("WARNING", f"    Error configurando switch 'web': {e}")

    try:
        set_price_switch(page, "pos", target_pos, dry_run)
        time.sleep(0.6)
        page.wait_for_load_state("networkidle", timeout=5000)
    except Exception as e:
        log("WARNING", f"    Error configurando switch 'pos': {e}")

    try:
        set_price_switch(page, "state", target_state, dry_run)
        time.sleep(0.6)
        page.wait_for_load_state("networkidle", timeout=5000)
    except Exception as e:
        log("WARNING", f"    Error configurando switch 'state': {e}")

    # 3. Subir Diseño Físico 63X177 en Boca y Godex si fue proporcionado
    if print_image and os.path.exists(print_image):
        # 3a. Boca
        boca_url = f"{clean_url}/designs/windows/boca.aspx"
        log("INFO", f"  🖨️ Navegando a Diseños Boca: {boca_url}")
        if not dry_run:
            safe_goto(page, boca_url)
            time.sleep(delay_ms / 1000.0)
            target_row = page.locator("tr").filter(has=page.locator("input.image-upload[data-height='236'][data-width='1134']")).first
            del_btn = target_row.locator(".image-delete, button[id*='-control-delete']").first
            select_btn = target_row.locator(".btn-file, span:has-text('Subir imagen')").first
            should_upload = prepare_image_slot(page, del_btn, select_btn, "Diseño Impresión Boca (63X177)", replace_images, dry_run, delay_ms)
            if should_upload:
                boca_input = target_row.locator("input.image-upload, input[type='file']").first
                handle_image_croppie_upload(page, boca_input, print_image, "Diseño Impresión Boca (63X177)", dry_run, delay_ms)
        else:
            handle_image_croppie_upload(page, None, print_image, "Diseño Impresión Boca (63X177)", dry_run, delay_ms)

        # 3b. Godex (Omitiendo 63X177PP / data-height="590")
        godex_url = f"{clean_url}/designs/windows/godex.aspx"
        log("INFO", f"  🖨️ Navegando a Diseños Godex (omitiendo 63X177PP): {godex_url}")
        if not dry_run:
            safe_goto(page, godex_url)
            time.sleep(delay_ms / 1000.0)
            target_row = page.locator("tr").filter(has=page.locator("input.image-upload[data-height='236'][data-width='1134']")).first
            del_btn = target_row.locator(".image-delete, button[id*='-control-delete']").first
            select_btn = target_row.locator(".btn-file, span:has-text('Subir imagen')").first
            should_upload = prepare_image_slot(page, del_btn, select_btn, "Diseño Impresión Godex (63X177)", replace_images, dry_run, delay_ms)
            if should_upload:
                godex_input = target_row.locator("input.image-upload, input[type='file']").first
                handle_image_croppie_upload(page, godex_input, print_image, "Diseño Impresión Godex (63X177)", dry_run, delay_ms)
        else:
            handle_image_croppie_upload(page, None, print_image, "Diseño Impresión Godex (63X177)", dry_run, delay_ms)

    # 4. Configurar Puntos de Venta (/poslimit.aspx)
    configure_pos_limits(page, clean_url, is_cortesia, dry_run, delay_ms)

    log("SUCCESS", f"  Configuración completa finalizada para '{referencia}'.")
    return True

def run_sync():
    args = parse_args()

    # Cargar datos del tarifario
    try:
        if args.pricing_json.strip().startswith("{"):
            pricing_data = json.loads(args.pricing_json)
        else:
            with open(args.pricing_json, "r", encoding="utf-8") as f:
                pricing_data = json.load(f)
    except Exception as e:
        log("ERROR", f"Error cargando JSON de tarifario: {e}")
        sys.exit(1)

    localidades_config = pricing_data.get("localidades", [])
    if not localidades_config:
        log("ERROR", "El JSON del tarifario no contiene la lista 'localidades'.")
        sys.exit(1)

    log("INFO", f"Iniciando conexión a Chrome vía CDP en {args.cdp_url}...")
    if args.digital_image:
        log("INFO", f"Arte Digital configurado: {args.digital_image}")
    if args.print_image:
        log("INFO", f"Arte Físico 63X177 configurado: {args.print_image}")

    with sync_playwright() as p:
        try:
            browser = p.chromium.connect_over_cdp(args.cdp_url)
        except Exception as e:
            log("ERROR", f"No se pudo conectar a Chrome en {args.cdp_url}.")
            log("ERROR", "Asegúrate de iniciar Chrome con: chrome.exe --remote-debugging-port=9222 --user-data-dir=\"C:\\chrome-dev-profile\"")
            sys.exit(1)

        context = browser.contexts[0] if browser.contexts else browser.new_context()
        page = find_or_create_qrboletos_page(context)

        # 1. Navegar a sections.aspx para escanear todas las localidades del show
        sections_url = f"https://dashboard.qrboletos.com/promoters/{args.promoter_id}/events/{args.event_id}/shows/{args.show_id}/sections.aspx"
        log("INFO", f"Navegando a estructura de localidades: {sections_url}")
        safe_goto(page, sections_url)

        available_sections = extract_sections_from_page(page)
        if not available_sections:
            log("ERROR", "No se detectaron localidades en sections.aspx. Revisa si la sesión está activa.")
            sys.exit(1)

        log("SUCCESS", f"Se detectaron {len(available_sections)} localidades disponibles en el panel.")

        total_creados = 0
        total_omitidos = 0
        total_configurados = 0

        # 2. Iterar sobre cada localidad del tarifario
        for loc_data in localidades_config:
            loc_nombre = loc_data.get("nombre", "")
            precios = loc_data.get("precios", [])

            log("INFO", f"\n=======================================================")
            log("INFO", f"Procesando localidad independiente: '{loc_nombre}' ({len(precios)} precios)")

            section_id = find_best_section_match(loc_nombre, available_sections)
            if not section_id:
                log("WARNING", f"No se encontró ID en sections.aspx para '{loc_nombre}'. Omitiendo.")
                continue

            # 2a. Configurar opciones de la localidad en settings.aspx (color #86ff8d y switches web/pos)
            configure_section_settings(
                page,
                promoter_id=args.promoter_id,
                event_id=args.event_id,
                show_id=args.show_id,
                section_id=section_id,
                loc_nombre=loc_nombre,
                precios=precios,
                dry_run=args.dry_run,
                delay_ms=args.delay_ms
            )

            prices_url = f"https://dashboard.qrboletos.com/promoters/{args.promoter_id}/events/{args.event_id}/shows/{args.show_id}/sections/{section_id}/prices/sales.aspx"
            log("INFO", f"Navegando a precios de '{loc_nombre}' (ID: {section_id}): {prices_url}")
            safe_goto(page, prices_url)
            time.sleep(args.delay_ms / 1000.0)

            prices_map = get_prices_map_from_table(page)
            log("INFO", f"Precios existentes en la tabla: {list(prices_map.keys()) if prices_map else 'Ninguno'}")

            for p_item in precios:
                ref = p_item.get("referencia", "").upper()
                target_valor = p_item.get("valor", 0)
                target_servicio = p_item.get("servicio", 0)

                price_info = prices_map.get(ref)
                price_url = price_info.get("url") if price_info else None
                necesita_recrear = False

                if ref in prices_map:
                    curr_valor = price_info.get("valor", 0)
                    curr_servicio = price_info.get("servicio", 0)
                    valores_difieren = (curr_valor != target_valor) or (curr_servicio != target_servicio)

                    if valores_difieren and args.archive_old_prices:
                        log("WARNING", f"  ⚠️ [VALOR CAMBIÓ] Precio '{ref}' en tabla: ${curr_valor:,} (+${curr_servicio:,}) -> Nuevo en tarifario: ${target_valor:,} (+${target_servicio:,})")

                        update_result = handle_existing_price_update(
                            page,
                            ref,
                            p_item,
                            price_info,
                            existing_names=list(prices_map.keys()),
                            dry_run=args.dry_run,
                            delay_ms=args.delay_ms
                        )

                        if update_result.get("action") == "updated_in_place":
                            price_url = update_result.get("price_url")
                            necesita_recrear = False
                            total_omitidos += 1
                        elif update_result.get("action") == "archived_need_create":
                            # Ajustar aforo descontando boletos vendidos
                            remaining_aforo = update_result.get("remaining_aforo", target_aforo)
                            p_item = {**p_item, "aforo": remaining_aforo}

                            if not args.dry_run:
                                # Volver a sales.aspx y re-escanear para liberar la referencia limpia
                                safe_goto(page, prices_url)
                                time.sleep(args.delay_ms / 1000.0)
                                prices_map = get_prices_map_from_table(page)

                            necesita_recrear = True
                        else:
                            log("ERROR", f"No se pudo procesar la actualización del precio '{ref}'.")
                            continue
                    else:
                        if valores_difieren:
                            log("WARNING", f"  ⚠️ [AVISO] El precio '{ref}' tiene valores diferentes en el tarifario (${target_valor:,} vs ${curr_valor:,}), pero el archivado está desactivado. Se conserva existente.")
                        else:
                            log("INFO", f"  [EXISTENTE] El precio '{ref}' ya existe en la tabla con valores idénticos.")
                        total_omitidos += 1
                else:
                    necesita_recrear = True

                if necesita_recrear:
                    success = fill_price_modal(page, p_item, dry_run=args.dry_run, delay_ms=args.delay_ms)
                    if success:
                        total_creados += 1
                        # Re-escanear tabla para obtener la URL de configuración del nuevo precio
                        if not args.dry_run:
                            time.sleep(1.0)
                            prices_map = get_prices_map_from_table(page)
                            new_info = prices_map.get(ref)
                            price_url = new_info.get("url") if new_info else None
                        else:
                            price_url = f"{prices_url}/simulated"
                    else:
                        log("ERROR", f"Fallo al cargar precio '{ref}'")
                        continue

                # Configurar opciones, artes e interruptores para este precio
                if not args.no_configure_prices and (price_url or args.dry_run):
                    cfg_target_url = price_url or f"{prices_url}/simulated"
                    try:
                        conf_ok = configure_single_price(
                            page,
                            cfg_target_url,
                            p_item,
                            digital_image=args.digital_image,
                            print_image=args.print_image,
                            replace_images=args.replace_images,
                            dry_run=args.dry_run,
                            delay_ms=args.delay_ms
                        )
                        if conf_ok:
                            total_configurados += 1
                    except Exception as e:
                        log("ERROR", f"Error inesperado configurando precio '{ref}': {e}")

                    # Volver a sales.aspx para continuar con el siguiente precio
                    if not args.dry_run:
                        try:
                            safe_goto(page, prices_url)
                            time.sleep(args.delay_ms / 1000.0)
                        except Exception as e:
                            log("WARNING", f"Error regresando a sales.aspx: {e}")

        log("INFO", f"\n=======================================================")
        log("SUCCESS", f"Proceso finalizado. Precios creados: {total_creados} | Precios existentes: {total_omitidos} | Precios configurados: {total_configurados}")

if __name__ == "__main__":
    run_sync()
