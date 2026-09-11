import sys
import json
import argparse
import re
import unicodedata
from playwright.sync_api import sync_playwright

def log(msg):
    sys.stderr.write(f"[INFO] {msg}\n")
    sys.stderr.flush()

def normalize_text(text):
    if not text:
        return ""
    nfd = unicodedata.normalize('NFD', text.lower())
    return "".join(c for c in nfd if unicodedata.category(c) != 'Mn')

def find_target_page(context, target_url=None, event_name=None):
    pages = [p for p in context.pages if "qrboletos.com" in p.url]
    if not pages:
        return None, None

    # 1. Coincidencia directa por target_url si fue provista
    if target_url:
        clean_target = target_url.replace("/sections.aspx", "").rstrip("/")
        for p in pages:
            if clean_target in p.url or p.url in clean_target:
                log(f"Coincidencia exacta por target-url: {p.url}")
                return p, p.url

    # 2. Coincidencia por nombre de evento
    if event_name:
        norm_event = normalize_text(event_name)
        keywords = [w for w in re.split(r'[^a-zA-Z0-9]+', norm_event) if len(w) >= 4 and w not in ['para', 'gran', 'este', 'show', 'teatro', 'concierto', 'evento']]
        log(f"Buscando pestaña para evento '{event_name}' con palabras clave: {keywords}")

        best_score = 0
        best_page = None

        for p in pages:
            try:
                page_info = p.evaluate('''() => {
                    const headings = Array.from(document.querySelectorAll('h1, h2, h3, .page-title, .breadcrumb, .navbar-brand, .event-title')).map(e => e.innerText || '');
                    return {
                        title: document.title || '',
                        headings: headings.join(' '),
                        url: window.location.href
                    };
                }''')
                combined_text = normalize_text(f"{page_info.get('title', '')} {page_info.get('headings', '')}")
                
                score = 0
                if norm_event in combined_text:
                    score += 100
                else:
                    matched = sum(1 for kw in keywords if kw in combined_text)
                    if matched > 0:
                        score += (matched / max(len(keywords), 1)) * 80

                if score > best_score:
                    best_score = score
                    best_page = p
            except Exception:
                continue

        if best_page and best_score >= 40:
            log(f"Pestaña identificada por nombre '{event_name}' (score {best_score}): {best_page.url}")
            return best_page, best_page.url

    # 3. Fallback: buscar pestaña que ya tenga /shows/ o /sections
    for p in pages:
        if "/shows/" in p.url or "/sections" in p.url:
            log(f"Fallback a pestaña con show/secciones: {p.url}")
            return p, p.url

    # 4. Fallback: cualquier pestaña de qrboletos
    log(f"Fallback a primera pestaña de qrboletos: {pages[0].url}")
    return pages[0], pages[0].url

def main():
    parser = argparse.ArgumentParser(description="Extraer localidades directamente de Chrome CDP")
    parser.add_argument("--target-url", help="URL base del show o de secciones")
    parser.add_argument("--event-name", help="Nombre del evento a buscar en pestañas abiertas")
    parser.add_argument("--cdp-url", default="http://localhost:9222", help="URL de depuración Chrome CDP")
    args = parser.parse_args()

    try:
        with sync_playwright() as p:
            browser = p.chromium.connect_over_cdp(args.cdp_url)
            context = browser.contexts[0]

            target_page, matched_url = find_target_page(context, args.target_url, args.event_name)

            if not target_page:
                print(json.dumps({
                    "success": False,
                    "error": "No se encontró ninguna pestaña de QRBoletos abierta en Google Chrome."
                }))
                return

            current_url = matched_url or target_page.url
            log(f"Pestaña seleccionada: {current_url}")

            promoter_id = ""
            event_id = ""
            show_id = ""
            base_show_url = ""
            sections_url = ""

            # Caso 1: La URL ya contiene /shows/{showId}
            show_match = re.search(r'(https?://[^/]+/promoters/([^/]+)/events/([^/]+)/shows/([^/?#]+))', current_url)
            if show_match:
                base_show_url = show_match.group(1)
                promoter_id = show_match.group(2)
                event_id = show_match.group(3)
                show_id = show_match.group(4)
                sections_url = f"{base_show_url}/sections.aspx"
                log(f"URL de show detectada directamente: {base_show_url}")
            else:
                # Caso 2: La URL contiene /events/{eventId} pero no /shows/{showId}
                event_match = re.search(r'(https?://[^/]+/promoters/([^/]+)/events/([^/?#]+))', current_url)
                if event_match:
                    base_event_url = event_match.group(1)
                    promoter_id = event_match.group(2)
                    event_id = event_match.group(3)
                    shows_list_url = f"{base_event_url}/shows.aspx"
                    log(f"URL de evento detectada sin showId. Consultando shows.aspx: {shows_list_url}")

                    temp_page = context.new_page()
                    try:
                        temp_page.goto(shows_list_url, wait_until="networkidle", timeout=15000)
                        show_links = temp_page.evaluate('''() => {
                            return Array.from(document.querySelectorAll('a[href*="/shows/"]')).map(a => a.href);
                        }''')
                        for link in show_links:
                            sm = re.search(r'/shows/([^/?#.]+)', link)
                            if sm:
                                show_id = sm.group(1)
                                break
                    finally:
                        temp_page.close()

                    if show_id:
                        base_show_url = f"{base_event_url}/shows/{show_id}"
                        sections_url = f"{base_show_url}/sections.aspx"
                        log(f"Show ID resuelto exitosamente: {show_id} -> {base_show_url}")
                    else:
                        raise Exception(f"No se pudo resolver el showId desde {shows_list_url}")
                else:
                    # Caso 3: Fallback general
                    sections_url = (args.target_url or current_url).split("?")[0]
                    sections_url = re.sub(r'/(settings|prices|sales|seats|shows)(\.aspx)?/sections\.aspx', '/sections.aspx', sections_url)
                    if "/sections" not in sections_url:
                        sections_url = sections_url.rstrip("/") + "/sections.aspx"
                    base_show_url = re.sub(r'/sections(\.aspx|/list\.aspx).*', '', sections_url)

                    m = re.search(r'/promoters/([^/]+)/events/([^/]+)/shows/([^/?#]+)', base_show_url)
                    if m:
                        promoter_id = m.group(1)
                        event_id = m.group(2)
                        show_id = m.group(3)

            log(f"Navegando a estructura de localidades: {sections_url}")
            
            # Usar una página nueva temporal en el contexto para no interferir con la navegación del usuario
            temp_page = context.new_page()
            temp_page.goto(sections_url, wait_until="networkidle", timeout=15000)
            
            # Esperar a que los elementos carguen
            temp_page.wait_for_selector("#sections-box, .card, table", timeout=8000)

            data = temp_page.evaluate('''() => {
                const titleEl = document.querySelector('h1, h2, h3, .page-title');
                const showTitle = titleEl ? titleEl.innerText.trim() : document.title;
                
                // Buscar tarjetas exclusivamente dentro de #sections-box si existe en el DOM
                const sectionsBox = document.querySelector('#sections-box');
                let rawCards = [];
                if (sectionsBox) {
                    rawCards = Array.from(sectionsBox.querySelectorAll('div.card, .section-item'));
                } else {
                    rawCards = Array.from(document.querySelectorAll('div.card, .section-item'));
                }

                // Filtrar solo las tarjetas hoja (ignorar tarjetas contenedor que tengan otras cards dentro o que contengan #sections-box)
                const cards = rawCards.filter(c => !c.querySelector('div.card') && !c.querySelector('#sections-box'));
                
                const results = [];
                const seenIds = new Set();
                const seenNames = new Set();
                const baseUrl = window.location.href.replace(/\\/sections(\\.aspx|\\/list\\.aspx).*/, '');

                for (const card of cards) {
                    const tds = Array.from(card.querySelectorAll('td'));
                    let name = '';
                    for (let i = 0; i < tds.length; i++) {
                        if (tds[i].innerText.toLowerCase().includes('localidad') && tds[i+1]) {
                            name = tds[i+1].innerText.replace(/\\s+/g, ' ').trim();
                            break;
                        }
                    }

                    if (!name) {
                        const cardTitle = card.querySelector('.card-title, h4, h5, h6, strong');
                        if (cardTitle) {
                            const raw = cardTitle.innerText.trim();
                            if (!raw.toUpperCase().includes('AGREGAR') && !raw.toUpperCase().includes('NUEVA')) {
                                name = raw;
                            }
                        }
                    }

                    if (!name || name.toUpperCase().includes('AGREGAR PRECIO') || name.toUpperCase().includes('NUEVA SECCI')) {
                        continue;
                    }

                    let secId = card.querySelector('[data-id]')?.getAttribute('data-id') || 
                                card.querySelector('.card-footer-loader')?.id?.replace('card-section-', '')?.replace('-loader', '') || '';

                    if (!secId) {
                        const linkWithSection = card.querySelector('a[href*="/sections/"]');
                        if (linkWithSection) {
                            const href = linkWithSection.getAttribute('href') || '';
                            const m = href.match(/\\/sections\\/([^\\/?#]+?)(?:\\.aspx|\\/|$)/);
                            if (m && !['editor', 'settings', 'sections', 'list', 'new', 'matrix'].includes(m[1].toLowerCase())) {
                                secId = m[1];
                            }
                        }
                    }

                    // Deduplicar estrictamente por ID y por Nombre normalizado
                    const normName = name.toUpperCase();
                    if (secId && seenIds.has(secId)) {
                        continue;
                    }
                    if (seenNames.has(normName)) {
                        continue;
                    }

                    if (secId) seenIds.add(secId);
                    seenNames.add(normName);

                    const configUrl = secId ? `${baseUrl}/sections/${secId}/settings.aspx` : `${baseUrl}/sections.aspx`;
                    const pricesUrl = secId ? `${baseUrl}/sections/${secId}/prices/sales.aspx` : '';
                    const seatsUrl = secId ? `${baseUrl}/sections/${secId}/seats.aspx` : '';

                    results.push({
                        nombre: name,
                        id: secId,
                        url: configUrl,
                        links: [
                            { label: 'Configuración', url: configUrl },
                            { label: 'Precios', url: pricesUrl },
                            { label: 'Acomodación', url: seatsUrl }
                        ].filter(l => Boolean(l.url))
                    });
                }
                return { showTitle, results };
            }''')
            
            temp_page.close()

            print(json.dumps({
                "success": True,
                "urlBase": base_show_url,
                "promoterId": promoter_id,
                "eventId": event_id,
                "showId": show_id,
                "sectionsUrl": sections_url,
                "showTitle": data.get("showTitle"),
                "total": len(data.get("results", [])),
                "localidades": data.get("results", [])
            }, ensure_ascii=False))

    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": f"Error extrayendo localidades desde Chrome: {str(e)}"
        }))

if __name__ == "__main__":
    main()
