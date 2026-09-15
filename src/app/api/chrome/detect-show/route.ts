import { NextResponse } from 'next/server';
import { parseEventUrl } from '@/services/urlParser';
import { parseShowMetadata, parseLocalidadesFromHtml } from '@/services/localitiesParser';
import { parseSpanishDateToISO } from '@/utils/dateFormatter';
import { Evento, Localidad } from '@/types';

interface ChromeTab {
  id: string;
  title: string;
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

/**
 * Evalúa una expresión de JavaScript en la pestaña de Chrome usando WebSocket CDP nativo.
 */
async function evaluateInTab(webSocketUrl: string, expression: string, timeoutMs: number = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const ws = new WebSocket(webSocketUrl);
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error('Timeout evaluando en la pestaña de Chrome'));
      }, timeoutMs);

      ws.onopen = () => {
        const msg = JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: { expression, returnByValue: true },
        });
        ws.send(msg);
      };

      ws.onmessage = (event) => {
        clearTimeout(timer);
        try {
          const response = JSON.parse(event.data.toString());
          ws.close();
          if (response.result && response.result.result) {
            resolve(response.result.result.value || '');
          } else {
            resolve('');
          }
        } catch {
          resolve('');
        }
      };

      ws.onerror = (err) => {
        clearTimeout(timer);
        ws.close();
        reject(err);
      };
    } catch (err) {
      reject(err);
    }
  });
}

export async function GET(request: Request) {
  const urlObj = new URL(request.url);
  const tabId = urlObj.searchParams.get('tabId');
  return handleDetect(request, tabId);
}

export async function POST(request: Request) {
  let body: any = {};
  try {
    body = await request.json().catch(() => ({}));
  } catch {}
  return handleDetect(request, body.tabId, body.url);
}

import { isRunningInCloud, forwardToLocalTunnel } from '@/services/tunnelProxy';

async function handleDetect(request: Request, selectedTabId?: string | null, manualUrl?: string | null) {
  if (isRunningInCloud()) {
    return forwardToLocalTunnel(request, '/api/chrome/detect-show');
  }

  const cdpUrl = 'http://localhost:9222';

  // 1. Verificar si Chrome CDP está abierto y activo
  let tabs: ChromeTab[] = [];
  try {
    const res = await fetch(`${cdpUrl}/json/list`, { cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json(
        {
          success: false,
          error: 'Chrome no respondió en el puerto 9222. Asegúrate de iniciarlo en modo depuración.',
          requiresChromeLaunch: true,
        },
        { status: 503 }
      );
    }
    tabs = await res.json();
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: `No se pudo conectar a Chrome en ${cdpUrl}: ${err.message}.`,
        requiresChromeLaunch: true,
      },
      { status: 503 }
    );
  }

  // 2. Filtrar todas las pestañas de QRBoletos
  const qrTabs = tabs.filter(
    (t) =>
      t.type === 'page' &&
      t.url.includes('qrboletos.com') &&
      (t.url.includes('/shows/') || t.url.includes('/events/') || t.url.includes('dashboard'))
  );

  if (qrTabs.length === 0) {
    // Si no hay de shows, buscar cualquier pestaña abierta de qrboletos
    const fallbackTabs = tabs.filter((t) => t.type === 'page' && t.url.includes('qrboletos.com'));
    if (fallbackTabs.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No se encontró ninguna pestaña de QRBoletos abierta en Google Chrome.',
        openTabsCount: tabs.length,
      });
    }
    qrTabs.push(...fallbackTabs);
  }

  // Comprobar si las pestañas de QRBoletos están en la pantalla de inicio de sesión
  const loginTab = qrTabs.find(
    (t) => t.url.toLowerCase().includes('login.aspx') || t.title?.toLowerCase().includes('iniciar sesión')
  );
  if (loginTab && qrTabs.every((t) => t.url.toLowerCase().includes('login.aspx') || t.title?.toLowerCase().includes('iniciar sesión'))) {
    return NextResponse.json(
      {
        success: false,
        code: 'SESSION_EXPIRED',
        error: 'Tu sesión en Google Chrome ha caducado. Inicia sesión en dashboard.qrboletos.com y vuelve a intentar.',
        sessionExpired: true,
        tabUrl: loginTab.url,
      },
      { status: 401 }
    );
  }

  // 3. Caso Múltiples Pestañas: Si hay más de 1 pestaña y el usuario NO ha seleccionado una todavía
  if (qrTabs.length > 1 && !selectedTabId && !manualUrl) {
    return NextResponse.json({
      success: true,
      multiple: true,
      totalTabs: qrTabs.length,
      tabs: qrTabs.map((t) => {
        const p = parseEventUrl(t.url);
        const cleanTitle = t.title
          .replace(/ - QRBoletos/i, '')
          .replace(/ - Dashboard/i, '')
          .trim();
        return {
          id: t.id,
          title: cleanTitle || t.url,
          url: t.url,
          promoterId: p?.promoterId,
          eventId: p?.eventId,
          showId: p?.showId,
        };
      }),
    });
  }

  // 4. Seleccionar la pestaña objetivo
  let targetTab: ChromeTab | null = null;
  if (selectedTabId) {
    targetTab = qrTabs.find((t) => t.id === selectedTabId) || null;
  } else if (manualUrl) {
    targetTab = qrTabs.find((t) => t.url.includes(manualUrl) || manualUrl.includes(t.url)) || null;
  }

  // Si no se encontró por ID o no se especificó y sólo hay una, tomar la primera
  if (!targetTab && qrTabs.length > 0) {
    targetTab = qrTabs[0];
  }

  if (!targetTab) {
    return NextResponse.json({
      success: false,
      error: 'No se pudo seleccionar la pestaña especificada.',
    });
  }

  // 5. Parsear IDs desde la URL de la pestaña
  const parsed = parseEventUrl(targetTab.url);
  if (!parsed) {
    return NextResponse.json({
      success: false,
      error: `La pestaña seleccionada (${targetTab.url}) no contiene una URL válida de evento/show (/promoters/{P}/events/{E}/shows/{S}).`,
      tabUrl: targetTab.url,
      tabTitle: targetTab.title,
    });
  }

  // 6. Extraer el HTML de la página en la sesión autenticada
  let html = '';
  if (targetTab.webSocketDebuggerUrl) {
    try {
      html = await evaluateInTab(targetTab.webSocketDebuggerUrl, 'document.documentElement.outerHTML', 6000);
    } catch (e: any) {
      console.warn('No se pudo extraer HTML por WebSocket CDP:', e.message);
    }
  }

  // 7. Parsear la información del show y las localidades
  const metadata = parseShowMetadata(html);
  const localidades: Localidad[] = parseLocalidadesFromHtml(html);

  const realEventName =
    metadata.evento ||
    targetTab.title
      .replace(/ - QRBoletos/i, '')
      .replace(/ - Dashboard/i, '')
      .trim() ||
    `Evento ${parsed.eventId}`;

  // Fecha normalizada: preferir fechaInicio, luego espectaculo si tiene formato fecha
  const rawDate = metadata.fechaInicio || metadata.espectaculo || '';
  const parsedDate = parseSpanishDateToISO(rawDate) || rawDate || new Date().toISOString().split('T')[0];

  const urlBase = `${parsed.domain}/promoters/${parsed.promoterId}/events/${parsed.eventId}/shows/${parsed.showId}`;

  const eventoDetectado: Evento = {
    id: metadata.eventoIdReal || `chrome-${parsed.eventId}-${parsed.showId}`,
    nombre: realEventName,
    fecha: parsedDate,
    promoterId: parsed.promoterId,
    eventId: parsed.eventId,
    showId: parsed.showId,
    urlBase,
    fechaCreacion: new Date().toISOString().split('T')[0],
    favorito: true,
    localidades,
    enVenta: false, // Evento en configuración / borrador (no a la venta aún)
    espectaculo: metadata.espectaculo || '',
    sitio: metadata.sitio || '',
    pulep: metadata.pulep || '',
  };

  return NextResponse.json({
    success: true,
    multiple: false,
    evento: eventoDetectado,
    tabUrl: targetTab.url,
    tabTitle: targetTab.title,
    metadata,
    totalLocalidades: localidades.length,
    isDraftOrConfig: true,
  });
}
