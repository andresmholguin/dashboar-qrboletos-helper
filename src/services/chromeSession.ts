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
 * Si la pestaña está en login.aspx y ya tiene credenciales cargadas (por autocompletado),
 * hace clic en el botón de iniciar sesión automáticamente.
 */
async function clickLoginIfCredentialsPresent(webSocketUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(webSocketUrl);
      const timer = setTimeout(() => {
        try { ws.close(); } catch {}
        resolve(false);
      }, 3000);

      ws.onopen = () => {
        const expression = `(() => {
          const pass = document.querySelector("#txtPassword, input[name*='txtPassword'], input[type='password']");
          const btn = document.querySelector("#login-button, button[type='submit'], input[type='submit'], .btn-primary");
          if (pass && pass.value && pass.value.length > 0 && btn) {
            btn.click();
            return 'CLICKED';
          }
          return 'NO_ACTION';
        })()`;
        ws.send(JSON.stringify({
          id: 101,
          method: 'Runtime.evaluate',
          params: { expression, returnByValue: true },
        }));
      };

      ws.onmessage = (event) => {
        clearTimeout(timer);
        try {
          const data = JSON.parse(event.data.toString());
          ws.close();
          const val = data?.result?.result?.value;
          resolve(val === 'CLICKED');
        } catch {
          resolve(false);
        }
      };

      ws.onerror = () => {
        clearTimeout(timer);
        try { ws.close(); } catch {}
        resolve(false);
      };
    } catch {
      resolve(false);
    }
  });
}

/**
 * Verifica si Google Chrome está en ejecución con el puerto de depuración 9222
 * y si la sesión de QRBoletos está activa o redirigida a la página de login.
 * Si detecta credenciales cargadas en login.aspx, hace clic automáticamente.
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
      if (loginTab.webSocketDebuggerUrl) {
        // Intentar auto-login si ya tiene credenciales cargadas
        const clicked = await clickLoginIfCredentialsPresent(loginTab.webSocketDebuggerUrl);
        if (clicked) {
          // Esperar 2.5s a que el servidor de QRBoletos procese el login y redirija
          await new Promise((r) => setTimeout(r, 2500));
          const refreshRes = await fetch(`${cdpUrl}/json/list`, { cache: 'no-store' });
          if (refreshRes.ok) {
            const refreshedTabs: ChromeTab[] = await refreshRes.json();
            const refreshedQrTabs = refreshedTabs.filter(
              (t) => t.type === 'page' && t.url && t.url.toLowerCase().includes('qrboletos.com')
            );
            const stillLogin = refreshedQrTabs.find((t) => t.url.toLowerCase().includes('login.aspx'));
            if (!stillLogin && refreshedQrTabs.length > 0) {
              return {
                chromeOnline: true,
                sessionActive: true,
                currentUrl: refreshedQrTabs[0].url,
              };
            }
          }
        }
      }

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
