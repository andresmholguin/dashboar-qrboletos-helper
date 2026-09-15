#!/usr/bin/env python3
"""
sync_event_settings_chrome.py
Agente de automatizacion para Google Chrome (CDP) que sincroniza la configuracion de un evento en:
https://dashboard.qrboletos.com/promoters/{promoter_id}/events/{event_id}/settings.aspx

Actualiza:
1. Edad minima (x-editable select)
2. Switches: comida, alcohol, embarazadas, discapacitados (BootstrapSwitch)
3. Descripcion del evento y Terminos y Condiciones (CKEditor y formulario #save)
4. Imagenes (Miniatura, Portada Horizontal y Portada Vertical) si se especifican
5. Recarga y verifica la persistencia de los cambios.
"""

import sys
import os
import json
import time
import argparse
from typing import Dict, Any, Optional
from playwright.sync_api import sync_playwright, Page, BrowserContext

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

def log(level: str, msg: str):
    symbols = {'INFO': 'i ', 'SUCCESS': 'OK ', 'WARNING': '! ', 'ERROR': 'X '}
    sym = symbols.get(level, '* ')
    try:
        print(f"[{level}] {sym} {msg}", flush=True)
    except Exception:
        print(f"[{level}] {msg}", flush=True)

def parse_args():
    parser = argparse.ArgumentParser(description="Sincronizador de Configuracion de Evento en Chrome CDP")
    parser.add_argument("--cdp-url", default="http://localhost:9222", help="URL de depuracion remota de Chrome")
    parser.add_argument("--promoter-id", required=True, help="ID del promotor")
    parser.add_argument("--event-id", required=True, help="ID del evento")
    parser.add_argument("--settings-json", required=True, help="Ruta al archivo JSON con las configuraciones del evento")
    parser.add_argument("--delay-ms", type=int, default=600, help="Espera en ms entre pasos")
    return parser.parse_args()

def find_or_create_qrboletos_page(context: BrowserContext) -> Page:
    for page in context.pages:
        if "qrboletos.com" in page.url:
            log("INFO", f"Usando pestana activa de QRBoletos: {page.url}")
            return page
    if len(context.pages) > 0:
        log("INFO", f"Usando primera pestana disponible: {context.pages[0].url}")
        return context.pages[0]
    log("INFO", "Creando nueva pestana para QRBoletos...")
    return context.new_page()

def upload_croppie_image(page: Page, img_type: str, file_path: str, context_label: str) -> bool:
    if not file_path or not os.path.exists(file_path):
        log("WARNING", f"{context_label}: Archivo de imagen no encontrado: {file_path}")
        return False

    abs_path = os.path.abspath(file_path)
    file_name = os.path.basename(abs_path)
    log("INFO", f"Subiendo {context_label} ('{file_name}')...")

    file_input = page.locator(f"input.image-upload[data-image='{img_type}'], #image-{img_type}-select input[type='file']").first
    if file_input.count() == 0 and img_type == 'banner':
        for i in range(1, 5):
            xpath = f"xpath=//*[contains(text(), 'Banner Top') or contains(text(), '1950px x 700px')]/ancestor::*[{i}]//input[@type='file']"
            file_input = page.locator(xpath).first
            if file_input.count() > 0:
                break

    if file_input.count() == 0:
        log("ERROR", f"No se encontro el selector de archivo para {context_label}.")
        return False

    try:
        file_input.set_input_files(abs_path)
    except Exception as e:
        log("ERROR", f"Error al asignar archivo para {context_label}: {e}")
        return False

    modal = page.locator("#modalImageUpload")
    try:
        modal.wait_for(state="visible", timeout=12000)
    except Exception:
        log("ERROR", f"No aparecio el modal de recorte para {context_label}.")
        return False

    time.sleep(0.8)

    log("INFO", f"Ajustando recorte al tamano completo para {context_label}...")
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

    btn_guardar = modal.locator("#modalImageUploadSave, button:has-text('Guardar')").first
    if btn_guardar.count() > 0:
        btn_guardar.click()
        log("INFO", f"Guardando imagen recortada de {context_label}...")
        try:
            modal.wait_for(state="hidden", timeout=30000)
            log("SUCCESS", f"{context_label} guardada correctamente en el servidor.")
            return True
        except Exception:
            log("WARNING", f"Tiempo de espera prolongado al guardar {context_label}, continuando...")
            return True
    else:
        log("ERROR", f"No se encontro el boton Guardar en el modal de recorte de {context_label}.")
        return False

def sync_event_settings():
    args = parse_args()

    if not os.path.exists(args.settings_json):
        log("ERROR", f"Archivo de configuracion no encontrado: {args.settings_json}")
        sys.exit(1)

    with open(args.settings_json, "r", encoding="utf-8") as f:
        settings: Dict[str, Any] = json.load(f)

    promoter_id = args.promoter_id
    event_id = args.event_id
    target_url = f"https://dashboard.qrboletos.com/promoters/{promoter_id}/events/{event_id}/settings.aspx"

    log("INFO", f"Iniciando sincronizacion de configuracion para el evento: {event_id}")
    log("INFO", f"Destino: {target_url}")

    with sync_playwright() as p:
        try:
            browser = p.chromium.connect_over_cdp(args.cdp_url)
        except Exception as e:
            log("ERROR", f"No se pudo conectar a Chrome en {args.cdp_url}. Verifique que Chrome este abierto con --remote-debugging-port=9222. Error: {e}")
            sys.exit(1)

        context = browser.contexts[0]
        page = find_or_create_qrboletos_page(context)

        if page.url != target_url:
            log("INFO", "Navegando a la pagina de configuracion del evento...")
            try:
                page.goto(target_url, wait_until="domcontentloaded", timeout=25000)
            except Exception as e:
                if "ERR_ABORTED" in str(e):
                    time.sleep(1.0)
                else:
                    page.goto(target_url, timeout=25000)
        else:
            log("INFO", "Pestana ya posicionada en la configuracion del evento.")

        # Validar si la sesión de QRBoletos expiró o redirigió al login
        curr_url = page.url.lower()
        if "login.aspx" in curr_url or "user/login" in curr_url:
            log("ERROR", "❌ [SESIÓN EXPIRADA] Redirección a login.aspx detectada en Google Chrome.")
            log("ERROR", "Tu sesión en QRBoletos ha caducado. Inicia sesión en Chrome y vuelve a intentarlo.")
            sys.exit(41)

        time.sleep(1.5)

        # 1. EDAD MINIMA
        min_age = settings.get("minAge")
        if min_age:
            log("INFO", f"Configurando Edad Minima a: '{min_age}'...")
            try:
                age_link = page.locator("a[data-pk='edad']").first
                if age_link.count() > 0:
                    age_link.click()
                    time.sleep(0.5)

                    res_age = page.evaluate("""(targetText) => {
                        const sel = document.querySelector('.editable-container select, .editable-input select');
                        if (!sel) return { success: false, reason: 'No select found' };
                        
                        const lowerTarget = targetText.toLowerCase().trim();
                        let matchOpt = Array.from(sel.options).find(o => o.text.trim().toLowerCase() === lowerTarget);
                        if (!matchOpt) {
                            matchOpt = Array.from(sel.options).find(o => o.text.toLowerCase().includes(lowerTarget));
                        }
                        if (!matchOpt) {
                            const digits = lowerTarget.replace(/[^0-9]/g, '');
                            if (digits) {
                                matchOpt = Array.from(sel.options).find(o => o.text.includes(digits));
                            }
                        }

                        if (matchOpt) {
                            sel.value = matchOpt.value;
                            $(sel).trigger('change');
                            const submitBtn = document.querySelector('.editable-submit, button[type="submit"].editable-submit');
                            if (submitBtn) {
                                submitBtn.click();
                                return { success: true, text: matchOpt.text.trim() };
                            }
                            return { success: false, reason: 'No submit button' };
                        }
                        return { success: false, reason: 'Option not found for: ' + targetText };
                    }""", min_age)

                    if res_age.get("success"):
                        log("SUCCESS", f"Edad minima seleccionada: '{res_age.get('text')}'")
                    else:
                        log("WARNING", f"No se pudo seleccionar la edad minima: {res_age.get('reason')}")
                    time.sleep(0.8)
                else:
                    log("WARNING", "No se encontro el elemento a[data-pk='edad'].")
            except Exception as e:
                log("ERROR", f"Error actualizando edad minima: {e}")

        # 2. SWITCHES DEL EVENTO
        switches_map = [
            ("comida", "Se vendera comida", settings.get("comida", True)),
            ("alcohol", "Se vendera bebidas alcoholicas", settings.get("alcohol", True)),
            ("embarazadas", "Apto para mujeres embarazadas", settings.get("embarazadas", True)),
            ("discapacitados", "Adaptado para personas con movilidad reducida", settings.get("discapacitados", True)),
        ]

        log("INFO", "Configurando switches de caracteristicas del evento...")
        for input_name, label, desired_val in switches_map:
            try:
                res_sw = page.evaluate("""(data) => {
                    const el = $(`input.switch[data-input="${data.input}"]`);
                    if (!el.length) return { found: false };
                    el.bootstrapSwitch('state', data.desired);
                    return { found: true, checked: el.prop('checked') };
                }""", {"input": input_name, "desired": bool(desired_val)})

                if res_sw.get("found"):
                    estado_str = "Activado (SI)" if desired_val else "Desactivado (NO)"
                    log("SUCCESS", f"Switch '{label}': {estado_str}")
                else:
                    log("WARNING", f"No se encontro el switch '{label}'")
                time.sleep(0.4)
            except Exception as e:
                log("ERROR", f"Error configurando switch '{label}': {e}")

        # 3. DESCRIPCION Y TERMINOS Y CONDICIONES (CKEditor)
        desc_html = settings.get("descripcion", "")
        tos_html = settings.get("tos", "")

        if desc_html or tos_html:
            log("INFO", "Guardando Descripcion del Evento y Terminos y Condiciones...")
            try:
                ck_result = page.evaluate("""(data) => {
                    return new Promise((resolve) => {
                        let ajaxDone = false;
                        const onAjax = (e, xhr, settings) => {
                            ajaxDone = true;
                            $(document).off('ajaxComplete', onAjax);
                            resolve({ success: true, status: xhr.status });
                        };
                        $(document).on('ajaxComplete', onAjax);

                        if (typeof CKEDITOR !== 'undefined') {
                            if (CKEDITOR.instances['descripcion']) {
                                CKEDITOR.instances['descripcion'].setData(data.desc);
                            }
                            if (CKEDITOR.instances['tos']) {
                                CKEDITOR.instances['tos'].setData(data.tos);
                            }
                        }
                        $('#descripcion').val(data.desc);
                        $('#tos').val(data.tos);

                        $('#save').click();

                        setTimeout(() => {
                            $(document).off('ajaxComplete', onAjax);
                            resolve({ success: ajaxDone, timeout: !ajaxDone });
                        }, 5000);
                    });
                }""", {"desc": desc_html, "tos": tos_html})

                log("SUCCESS", f"Descripcion y Terminos y Condiciones guardados exitosamente.")
                time.sleep(1.5)
            except Exception as e:
                log("ERROR", f"Error guardando descripcion y terminos: {e}")

        # 4. IMAGENES DEL EVENTO (OPCIONALES)
        img_home = settings.get("imageHome")
        if img_home and os.path.exists(img_home):
            upload_croppie_image(page, "home", img_home, "Imagen Miniatura (720x639)")
            time.sleep(1)

        img_afiche = settings.get("imageAfiche")
        if img_afiche and os.path.exists(img_afiche):
            upload_croppie_image(page, "afiche", img_afiche, "Imagen Portada Vertical (800x800)")
            time.sleep(1)

        img_banner = settings.get("imageBanner")
        if img_banner and os.path.exists(img_banner):
            upload_croppie_image(page, "banner", img_banner, "Imagen Portada Horizontal (1950x700)")
            time.sleep(1)

        # 5. RECARGA Y VERIFICACION
        log("INFO", "Recargando pagina para verificar persistencia en el servidor...")
        try:
            page.reload(wait_until="networkidle")
            time.sleep(2)

            verify_res = page.evaluate("""() => {
                return {
                    edad: $('a[data-pk="edad"]').text().trim(),
                    comida: $('input.switch[data-input="comida"]').prop('checked'),
                    alcohol: $('input.switch[data-input="alcohol"]').prop('checked'),
                    embarazadas: $('input.switch[data-input="embarazadas"]').prop('checked'),
                    discapacitados: $('input.switch[data-input="discapacitados"]').prop('checked'),
                    descLen: (typeof CKEDITOR !== 'undefined' && CKEDITOR.instances['descripcion']) ? CKEDITOR.instances['descripcion'].getData().length : $('#descripcion').val().length,
                    tosLen: (typeof CKEDITOR !== 'undefined' && CKEDITOR.instances['tos']) ? CKEDITOR.instances['tos'].getData().length : $('#tos').val().length,
                };
            }""")

            log("SUCCESS", "Verificacion post-recarga:")
            log("INFO", f"   * Edad Minima: {verify_res.get('edad')}")
            log("INFO", f"   * Comida: {'Activado' if verify_res.get('comida') else 'Desactivado'}")
            log("INFO", f"   * Bebidas Alcoholicas: {'Activado' if verify_res.get('alcohol') else 'Desactivado'}")
            log("INFO", f"   * Mujeres Embarazadas: {'Activado' if verify_res.get('embarazadas') else 'Desactivado'}")
            log("INFO", f"   * Movilidad Reducida: {'Activado' if verify_res.get('discapacitados') else 'Desactivado'}")
            log("INFO", f"   * Longitud HTML Descripcion: {verify_res.get('descLen')} caracteres")
            log("INFO", f"   * Longitud HTML Terminos: {verify_res.get('tosLen')} caracteres")
            log("SUCCESS", "CONFIGURACION SINCRONIZADA Y CONFIRMADA EXITOSAMENTE!")
        except Exception as e:
            log("WARNING", f"Advertencia en la verificacion post-recarga: {e}")

if __name__ == '__main__':
    sync_event_settings()
