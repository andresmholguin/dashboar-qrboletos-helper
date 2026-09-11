import * as cheerio from 'cheerio';
import { Localidad, Evento } from '@/types';

export interface ShowMetadata {
  evento?: string;
  pulep?: string;
  eventId?: string;
  showId?: string;
  eventoIdReal?: string;
  showIdReal?: string;
  promoterId?: string;
  espectaculo?: string;
  sitio?: string;
  fechaInicio?: string;
  fechaFin?: string;
  localidadActual?: string;
  sectionIdActual?: string;
}

/**
 * Parsea los datos de cabecera de una página de show o localidad en QRBoletos:
 * Evento, Código PULEP, ID Evento, Espectáculo, Sitio, Fechas, ID Show, Localidad.
 */
export function parseShowMetadata(html: string): ShowMetadata {
  const $ = cheerio.load(html);
  const metadata: ShowMetadata = {};
  let lastLabel = '';

  // Buscar celdas o etiquetas clave en tablas de metadatos
  $('tr').each((_, trEl) => {
    const row = $(trEl);
    const cells = row.find('td, th').map((_, el) => $(el).text().trim()).get();
    if (cells.length >= 2) {
      const label = cells[0].toLowerCase();
      const val = cells[cells.length - 1];

      // Nombre real del evento
      if ((label.startsWith('evento') || label === 'evento:') && !label.includes('tipo') && !label.includes('pulep')) {
        if (val && !val.toLowerCase().includes('evento')) {
          metadata.evento = val.replace(/[\u201c\u201d\u2018\u2019]/g, '"').trim();
        }
      } else if (label.includes('espectáculo') || label.includes('espectaculo')) {
        if (val && !val.toLowerCase().includes('espectáculo')) metadata.espectaculo = val;
      } else if (label.includes('sitio') || label.includes('lugar')) {
        if (val && !val.toLowerCase().includes('sitio')) metadata.sitio = val;
      } else if (label.includes('pulep')) {
        if (val && !val.toLowerCase().includes('pulep')) metadata.pulep = val;
      } else if (label.includes('fecha de inicio')) {
        if (val) metadata.fechaInicio = val;
      } else if (label.includes('fecha de finalización') || label.includes('fecha fin')) {
        if (val) metadata.fechaFin = val;
      } else if (label.includes('localidad:')) {
        if (val && !val.includes('Localidad:')) metadata.localidadActual = val;
      } else if (label.startsWith('id')) {
        if (lastLabel.includes('pulep') || lastLabel.includes('evento')) {
          metadata.eventoIdReal = val;
        } else if (lastLabel.includes('finalizaci') || lastLabel.includes('inicio') || lastLabel.includes('espect')) {
          metadata.showIdReal = val;
        }
      }
      lastLabel = label;
    }
  });

  return metadata;
}

/**
 * Parsea el HTML de la página sections.aspx o list.aspx para extraer todas las localidades y sus enlaces.
 */
export function parseLocalidadesFromHtml(html: string): Localidad[] {
  const localidades: Localidad[] = [];
  const $ = cheerio.load(html);

  // Intentamos buscar en el contenedor específico #sections-box div.card
  let cards = $('#sections-box div.card');

  if (cards.length === 0) {
    cards = $('div.card');
  }

  if (cards.length === 0) {
    cards = $('.card, .panel, .section-item');
  }

  // Filtrar tarjetas contenedoras que contengan otras tarjetas o el propio #sections-box
  cards = cards.filter((_, el) => $(el).find('div.card, #sections-box').length === 0);

  cards.each((_, el) => {
    const card = $(el);

    // 1. Extraer nombre de la localidad
    let nombre = '';

    // Buscar si hay una tabla con celda "Localidad" dentro de la tarjeta
    const tdLabel = card.find('td').filter((_, tdEl) => $(tdEl).text().toLowerCase().includes('localidad'));
    if (tdLabel.length > 0) {
      nombre = tdLabel.next('td').text().trim();
    }

    if (!nombre) {
      nombre = card.find('.card-title, h4, h5, h6, strong, .title').first().text().trim();
    }

    if (!nombre) {
      const cardClone = card.clone();
      cardClone.find('a, button, script, style, input, form').remove();
      nombre = cardClone.text().replace(/\s+/g, ' ').trim();
    }

    // 2. Extraer todos los links de la tarjeta
    const allLinks: { label: string; url: string }[] = [];
    let primaryHref = '';
    const links = card.find('a[href]');

    links.each((_, linkEl) => {
      const link = $(linkEl);
      const urlText = link.attr('href') || '';
      const label = link.text().replace(/\s+/g, ' ').trim() || 'Ver';

      if (urlText) {
        if (!allLinks.some((l) => l.url === urlText)) {
          allLinks.push({ label, url: urlText });
        }

        const lowerLabel = label.toLowerCase();
        const lowerUrl = urlText.toLowerCase();
        if (
          !primaryHref &&
          (lowerLabel.includes('config') ||
            lowerLabel.includes('edit') ||
            lowerLabel.includes('setup') ||
            lowerUrl.includes('config') ||
            lowerUrl.includes('edit') ||
            lowerUrl.includes('setup') ||
            lowerUrl.includes('/sections/'))
        ) {
          primaryHref = urlText;
        }
      }
    });

    if (!primaryHref && allLinks.length > 0) {
      primaryHref = allLinks[0].url;
    }

    if (nombre) {
      nombre = nombre
        .replace(/\r?\n|\r/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    if (nombre && primaryHref) {
      let id: string | undefined;
      const pathIdMatch = primaryHref.match(/\/sections\/([^\/]+)/);
      const queryIdMatch = primaryHref.match(/(?:id|sectionid|sectionId|secId)=([^&]+)/i);

      if (pathIdMatch && pathIdMatch[1] !== 'settings.aspx' && pathIdMatch[1] !== 'list.aspx') {
        id = pathIdMatch[1];
      } else if (queryIdMatch) {
        id = queryIdMatch[1];
      }

      const derivedLinks = generateLocalityLinks(primaryHref);

      // Evitar duplicados por nombre o id
      if (!localidades.some((loc) => loc.id === id || loc.nombre.toUpperCase() === nombre.toUpperCase())) {
        localidades.push({
          nombre,
          url: primaryHref,
          id,
          links: derivedLinks,
        });
      }
    }
  });

  // Fallback a tablas tradicionales
  if (localidades.length === 0) {
    $('table tr').each((_, trEl) => {
      const cells = $(trEl).find('td');
      if (cells.length >= 2) {
        const nombreText = cells.first().text().trim();
        const hrefText = cells.find('a[href]').first().attr('href') || '';
        if (nombreText && hrefText) {
          let id: string | undefined;
          const pathIdMatch = hrefText.match(/\/sections\/([^\/]+)/);
          const queryIdMatch = hrefText.match(/(?:id|sectionid|sectionId|secId)=([^&]+)/i);

          if (pathIdMatch && pathIdMatch[1] !== 'settings.aspx' && pathIdMatch[1] !== 'list.aspx') {
            id = pathIdMatch[1];
          } else if (queryIdMatch) {
            id = queryIdMatch[1];
          }

          if (!localidades.some((loc) => loc.nombre.toUpperCase() === nombreText.toUpperCase())) {
            localidades.push({
              nombre: nombreText,
              url: hrefText,
              id,
              links: generateLocalityLinks(hrefText),
            });
          }
        }
      }
    });
  }

  return localidades;
}

/**
 * Genera automáticamente los 3 enlaces estándar para cada localidad:
 * 1. Configuración: .../sections/{ID}/settings.aspx
 * 2. Precios: .../sections/{ID}/prices/sales.aspx
 * 3. Acomodación: .../sections/{ID}/seats.aspx
 */
export function generateLocalityLinks(primaryUrl: string): { label: string; url: string }[] {
  const pathMatch = primaryUrl.match(/^(.*\/sections\/[^\/]+)/);
  if (pathMatch) {
    const base = pathMatch[1];
    if (!base.endsWith('/settings.aspx') && !base.endsWith('/list.aspx')) {
      return [
        { label: 'Configuración', url: `${base}/settings.aspx` },
        { label: 'Precios', url: `${base}/prices/sales.aspx` },
        { label: 'Acomodación', url: `${base}/seats.aspx` },
      ];
    }
  }

  const idMatch = primaryUrl.match(/(?:id|sectionid|sectionId|secId)=([^&]+)/i);
  if (idMatch) {
    const id = idMatch[1];
    const baseMatch = primaryUrl.match(/^(.*)\/sections\//i);
    if (baseMatch) {
      const base = baseMatch[1];
      return [
        { label: 'Configuración', url: `${base}/sections/settings.aspx?id=${id}` },
        { label: 'Precios', url: `${base}/sections/prices/sales.aspx?id=${id}` },
        { label: 'Acomodación', url: `${base}/sections/seats.aspx?id=${id}` },
      ];
    }
  }

  return [{ label: 'Configuración', url: primaryUrl }];
}
