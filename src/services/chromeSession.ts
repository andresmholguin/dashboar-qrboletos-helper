export interface ChromeSessionStatus {
  chromeOnline: boolean;
  sessionActive: boolean;
  currentUrl?: string;
  error?: 'CHROME_OFFLINE' | 'NO_QRBOLETOS_TAB' | 'SESSION_EXPIRED' | 'UNKNOWN';
  message?: string;
}

interface ChromeTab {
  id: string;
  title: string;
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

/**
 * Verifica si Google Chrome está en ejecución con el puerto de depuración 9222
 * y si la sesión de QRBoletos está activa o redirigida a la página de login.
 */
export async function verifyChromeSession(cdpUrl = 'http://localhost:9222'): Promise<ChromeSessionStatus> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`${cdpUrl}/json/list`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return {
        chromeOnline: false,
        sessionActive: false,
        error: 'CHROME_OFFLINE',
        message: `Chrome no respondió en ${cdpUrl}. Verifica que esté abierto con --remote-debugging-port=9222.`,
      };
    }

    const tabs: ChromeTab[] = await res.json();
    const qrTabs = tabs.filter(
      (t) => t.type === 'page' && t.url && t.url.toLowerCase().includes('qrboletos.com')
    );

    if (qrTabs.length === 0) {
      return {
        chromeOnline: true,
        sessionActive: false,
        error: 'NO_QRBOLETOS_TAB',
        message: 'No hay ninguna pestaña de QRBoletos abierta en Google Chrome.',
      };
    }

    // Comprobar si alguna pestaña está en la página de inicio de sesión
    const loginTab = qrTabs.find(
      (t) =>
        t.url.toLowerCase().includes('login.aspx') ||
        t.title?.toLowerCase().includes('iniciar sesión') ||
        t.title?.toLowerCase().includes('login')
    );

    if (loginTab) {
      return {
        chromeOnline: true,
        sessionActive: false,
        currentUrl: loginTab.url,
        error: 'SESSION_EXPIRED',
        message: 'Tu sesión en Google Chrome ha caducado. Por favor inicia sesión en dashboard.qrboletos.com.',
      };
    }

    // Comprobar si hay pestañas dentro del panel autenticado
    const activePanelTab = qrTabs.find(
      (t) =>
        t.url.toLowerCase().includes('/promoters/') ||
        t.url.toLowerCase().includes('/shows/') ||
        t.url.toLowerCase().includes('/events/') ||
        t.url.toLowerCase().includes('/reports/') ||
        t.url.toLowerCase().includes('/dashboard')
    );

    return {
      chromeOnline: true,
      sessionActive: true,
      currentUrl: activePanelTab ? activePanelTab.url : qrTabs[0].url,
    };
  } catch (err: any) {
    const isOffline = err.name === 'AbortError' || err.code === 'ECONNREFUSED' || err.message?.includes('fetch failed');
    return {
      chromeOnline: false,
      sessionActive: false,
      error: isOffline ? 'CHROME_OFFLINE' : 'UNKNOWN',
      message: isOffline
        ? 'Google Chrome no está abierto en modo depuración (puerto 9222).'
        : `Error verificando sesión de Chrome: ${err.message}`,
    };
  }
}
