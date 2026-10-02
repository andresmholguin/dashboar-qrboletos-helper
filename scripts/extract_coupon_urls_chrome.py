#!/usr/bin/env python3
"""
extract_coupon_urls_chrome.py
Conecta a Chrome via CDP y extrae todas las URLs de coupons.aspx (Descuentos)
para cada precio de cada localidad del evento, excluyendo CORTESIAS.
"""
import sys
import json
import argparse
import re
import time
from playwright.sync_api import sync_playwright

def log(msg):
    sys.stderr.write(f"[INFO] {msg}\n")
    sys.stderr.flush()

def main():
    parser = argparse.ArgumentParser(description="Extraer URLs de Descuentos/Cupones desde Chrome CDP")
    parser.add_argument("--show-url", required=True, help="URL base del show (ej: https://dashboard.qrboletos.com/.../shows/...)")
    parser.add_argument("--sections-json", default=None, help="JSON con lista de secciones [{ id, nombre }]")
    parser.add_argument("--cdp-url", default="http://localhost:9222", help="URL de depuracion Chrome CDP")
    parser.add_argument("--open-in-chrome", action="store_true", default=False, help="Abrir cada URL directamente como una pestaña en Google Chrome")
    args = parser.parse_args()

    clean_show_url = args.show_url.split("?")[0].rstrip("/")
    # Asegurar que no termine en /sections o subpáginas
    clean_show_url = re.sub(r'/(sections|prices|sales|seats|settings)(\.aspx|/list\.aspx)?.*$', '', clean_show_url)

    try:
        with sync_playwright() as p:
            try:
                browser = p.chromium.connect_over_cdp(args.cdp_url)
            except Exception as e_cdp:
                print(json.dumps({
                    "success": False,
                    "code": "CHROME_OFFLINE",
                    "error": f"Google Chrome no respondió en {args.cdp_url}. Inicia 'Iniciar_Chrome_Boleteria.bat'."
                }))
                return

            context = browser.contexts[0]
            
            # Buscar una pestaña activa de qrboletos o usar la primera
            qr_page = None
            for pg in context.pages:
                if "qrboletos.com" in pg.url:
                    qr_page = pg
                    break
            if not qr_page:
                if len(context.pages) > 0:
                    qr_page = context.pages[0]
                else:
                    qr_page = context.new_page()

            # Verificar si está en login
            curr_url = qr_page.url.lower()
            if "login.aspx" in curr_url or "user/login" in curr_url:
                log("Pantalla de login detectada en Chrome. Intentando auto-login...")
                try:
                    btn = qr_page.query_selector("#login-button, button[type='submit'], input[type='submit'], .btn-primary")
                    if btn:
                        btn.click()
                        time.sleep(2)
                except Exception:
                    pass

            sections_data = []
            if args.sections_json:
                try:
                    sections_data = json.loads(args.sections_json)
                except Exception:
                    sections_data = []

            js_code = """async ({ showUrl, inputSections }) => {
                const parser = new DOMParser();
                const seenSecIds = new Set();
                const sections = [];

                // 1. Siempre consultar sections.aspx para tener la totalidad de secciones reales del evento
                try {
                    const secResp = await fetch(`${showUrl}/sections.aspx`);
                    if (secResp.ok) {
                        const secHtml = await secResp.text();
                        const secDoc = parser.parseFromString(secHtml, 'text/html');
                        
                        const cards = Array.from(secDoc.querySelectorAll('div.card, .section-item'))
                            .filter(c => !c.querySelector('div.card') && !c.querySelector('#sections-box'));
                        
                        for (const card of cards) {
                            let secId = card.querySelector('[data-id]')?.getAttribute('data-id') || 
                                        card.querySelector('.card-footer-loader')?.id?.replace('card-section-', '')?.replace('-loader', '') || '';
                            if (!secId) {
                                const link = card.querySelector('a[href*="/sections/"]');
                                if (link) {
                                    const m = link.getAttribute('href').match(/\\/sections\\/([^\\/?#]+?)(?:\\.aspx|\\/|$)/);
                                    if (m && !['editor', 'settings', 'sections', 'list', 'new', 'matrix'].includes(m[1].toLowerCase())) {
                                        secId = m[1];
                                    }
                                }
                            }
                            let name = '';
                            const tds = Array.from(card.querySelectorAll('td'));
                            for (let i = 0; i < tds.length; i++) {
                                if (tds[i].innerText.toLowerCase().includes('localidad') && tds[i+1]) {
                                    name = tds[i+1].innerText.replace(/\\s+/g, ' ').trim();
                                    break;
                                }
                            }
                            if (!name) {
                                name = card.querySelector('.card-title, h4, h5, strong')?.innerText.trim() || '';
                            }
                            if (secId && !seenSecIds.has(secId) && name && !name.toUpperCase().includes('AGREGAR')) {
                                seenSecIds.add(secId);
                                sections.push({ secId, name });
                            }
                        }
                    }
                } catch (e) {
                    console.error('Error cargando sections.aspx:', e);
                }

                // 2. Si se pasaron inputSections, agregar cualquier sección complementaria no detectada
                if (Array.isArray(inputSections) && inputSections.length > 0) {
                    for (const s of inputSections) {
                        const secId = s.id || s.secId;
                        const name = s.nombre || s.name || '';
                        if (secId && !seenSecIds.has(secId)) {
                            seenSecIds.add(secId);
                            sections.push({ secId, name });
                        }
                    }
                }

                // 3. Extraer todos los precios comerciales (no cortesías) de cada sección en paralelo
                const couponItems = [];
                const allUrls = [];

                await Promise.all(sections.map(async (sec) => {
                    const pricesUrl = `${showUrl}/sections/${sec.secId}/prices/sales.aspx`;
                    try {
                        const resp = await fetch(pricesUrl);
                        if (!resp.ok) return;
                        const html = await resp.text();
                        const doc = parser.parseFromString(html, 'text/html');
                        const rows = Array.from(doc.querySelectorAll('table tbody tr, table tr'));
                        const seenPriceIds = new Set();
                        
                        for (const tr of rows) {
                            const priceLinks = Array.from(tr.querySelectorAll('a[href*="/prices/sales/"]'));
                            if (priceLinks.length === 0) continue;
                            const priceLink = priceLinks[0];
                            const href = priceLink.getAttribute('href') || '';
                            const m = href.match(/\\/prices\\/sales\\/([^\\/?#.]+)/);
                            if (!m) continue;
                            const priceId = m[1];
                            if (seenPriceIds.has(priceId)) continue;
                            seenPriceIds.add(priceId);
                            
                            const tds = Array.from(tr.querySelectorAll('td'));
                            let refName = priceLink.innerText.trim();
                            let etapa = '';
                            if (tds.length >= 3) {
                                refName = tds[1].innerText.trim() || refName;
                                etapa = tds[2].innerText.trim();
                            }
                            
                            const refUpper = refName.toUpperCase();
                            const etapaUpper = etapa.toUpperCase();
                            const isCortesia = refUpper.includes('CORTESIA') || etapaUpper.includes('CORTESIA');
                            
                            // Si es cortesía, omitir
                            if (isCortesia) continue;
                            
                            const couponsUrl = `${showUrl}/sections/${sec.secId}/prices/sales/${priceId}/coupons.aspx`;
                            allUrls.push(couponsUrl);
                            
                            couponItems.push({
                                secId: sec.secId,
                                secName: sec.name,
                                priceId,
                                priceName: refName,
                                etapa,
                                couponsUrl
                            });
                        }
                    } catch (err) {
                        // ignore network error on individual section
                    }
                }));

                return {
                    sectionsCount: sections.length,
                    total: allUrls.length,
                    couponItems,
                    allUrls
                };
            }"""

            res = qr_page.evaluate(js_code, {
                "showUrl": clean_show_url,
                "inputSections": sections_data
            })

            all_urls = res.get("allUrls", [])
            opened_in_chrome = False
            opened_count = 0

            # Si se solicitó abrir en Chrome y hay URLs, crearlas mediante sesión CDP directa
            if args.open_in_chrome and len(all_urls) > 0:
                try:
                    cdp_client = context.new_cdp_session(qr_page)
                    for url in all_urls:
                        cdp_client.send("Target.createTarget", {"url": url})
                        time.sleep(0.04) # intervalo seguro de 40ms entre pestañas
                    opened_in_chrome = True
                    opened_count = len(all_urls)
                    log(f"Abiertas exitosamente {opened_count} pestañas en Google Chrome via CDP")
                except Exception as e_cdp_open:
                    log(f"Aviso al abrir pestañas vía CDP: {e_cdp_open}")

            print(json.dumps({
                "success": True,
                "showUrl": clean_show_url,
                "sectionsCount": res.get("sectionsCount", 0),
                "total": res.get("total", 0),
                "openedInChrome": opened_in_chrome,
                "openedCount": opened_count,
                "coupons": res.get("couponItems", []),
                "urls": all_urls
            }, ensure_ascii=False))

    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": f"Error extrayendo cupones desde Chrome: {str(e)}"
        }))

if __name__ == "__main__":
    main()
