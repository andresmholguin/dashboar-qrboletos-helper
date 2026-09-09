export interface ParsedEventUrl {
  promoterId: string;
  eventId: string;
  showId: string;
  sectionId?: string;
  domain: string;
}

/**
 * Parsea una URL de QRBoletos para extraer los IDs del promotor, evento y show.
 * Ejemplo de entrada:
 * https://dashboard.qrboletos.com/promoters/AAA/events/BBB/shows/CCC/reports/sales/summary.aspx
 */
export function parseEventUrl(urlStr: string): ParsedEventUrl | null {
  try {
    const trimmed = urlStr.trim();
    if (!trimmed) return null;

    // Intentamos parsear la URL
    let urlObj: URL;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      urlObj = new URL(trimmed);
    } else {
      // Agregar protocolo por defecto si se ingresó sin él
      urlObj = new URL(`https://${trimmed}`);
    }

    const path = urlObj.pathname;
    
    // Buscar los patrones en el path
    const promoterMatch = path.match(/\/promoters\/([^\/]+)/i);
    const eventMatch = path.match(/\/events\/([^\/]+)/i);
    const showMatch = path.match(/\/shows\/([^\/]+)/i);
    const sectionMatch = path.match(/\/sections\/([^\/]+)/i);
    const sectionId = sectionMatch && !sectionMatch[1].endsWith('.aspx') ? sectionMatch[1] : undefined;

    if (promoterMatch && eventMatch && showMatch) {
      return {
        promoterId: promoterMatch[1],
        eventId: eventMatch[1],
        showId: showMatch[1],
        sectionId,
        domain: urlObj.origin, // Conserva http/https y el host (ej. https://dashboard.qrboletos.com)
      };
    }
  } catch (error) {
    console.error('Error parseando la URL:', error);
  }
  
  return null;
}


/**
 * Reconstruye una URL completa para un módulo específico
 */
export function buildModuleUrl(
  domain: string,
  promoterId: string,
  eventId: string,
  showId: string,
  modulePath: string
): string {
  // Asegurar que el path comience con / si no lo tiene
  const cleanPath = modulePath.startsWith('/') ? modulePath : `/${modulePath}`;
  
  // Si la ruta del módulo es settings.aspx (Configuración de Evento), no requiere /shows/{showId}
  if (modulePath === 'settings.aspx') {
    return `${domain}/promoters/${promoterId}/events/${eventId}${cleanPath}`;
  }
  
  return `${domain}/promoters/${promoterId}/events/${eventId}/shows/${showId}${cleanPath}`;
}
