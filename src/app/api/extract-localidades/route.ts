import { NextResponse } from 'next/server';
import { Localidad } from '@/types';
import { parseLocalidadesFromHtml } from '@/services/localitiesParser';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { url, cookie, htmlContent } = body;

    // Caso A: El usuario ya proporcionó el HTML directamente (Pegado Manual)
    if (htmlContent) {
      const localidades = parseLocalidadesFromHtml(htmlContent);
      return NextResponse.json({
        success: true,
        localidades,
        source: 'manual',
      });
    }

    // Caso B: El usuario quiere que obtengamos las localidades desde la URL
    if (!url) {
      return NextResponse.json(
        { success: false, error: 'Se requiere una "url" o "htmlContent".' },
        { status: 400 }
      );
    }

    // 1. Intentar obtener el contenido mediante Chrome CDP si está activo en el puerto 9222
    try {
      const cdpCheck = await fetch('http://localhost:9222/json/list', { cache: 'no-store' });
      if (cdpCheck.ok) {
        const tabs: any[] = await cdpCheck.json();
        // Buscar si la URL o alguna página de QRBoletos está abierta
        const tab = tabs.find((t) => t.url.includes(url) || url.includes(t.url) || t.url.includes('qrboletos.com'));
        if (tab && tab.webSocketDebuggerUrl) {
          // Evaluar HTML directamente desde la sesión autenticada de Chrome
          const ws = new WebSocket(tab.webSocketDebuggerUrl);
          const htmlPromise = new Promise<string>((resolve) => {
            const timer = setTimeout(() => resolve(''), 4000);
            ws.onopen = () => {
              ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: 'document.documentElement.outerHTML', returnByValue: true } }));
            };
            ws.onmessage = (e) => {
              clearTimeout(timer);
              try {
                const res = JSON.parse(e.data.toString());
                ws.close();
                resolve(res.result?.result?.value || '');
              } catch {
                resolve('');
              }
            };
            ws.onerror = () => {
              clearTimeout(timer);
              resolve('');
            };
          });

          const cdpHtml = await htmlPromise;
          if (cdpHtml && cdpHtml.length > 500) {
            const localidades = parseLocalidadesFromHtml(cdpHtml);
            if (localidades.length > 0) {
              return NextResponse.json({
                success: true,
                localidades,
                source: 'chrome-cdp',
              });
            }
          }
        }
      }
    } catch (cdpErr) {
      // Continuar con fetch ordinario
    }

    // 2. Fetch ordinario HTTP como fallback
    try {
      const headers: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      };

      if (cookie) {
        headers['Cookie'] = cookie;
      }

      const response = await fetch(url, {
        headers,
        cache: 'no-store',
      });

      if (!response.ok) {
        return NextResponse.json({
          success: false,
          error: `Error al obtener la página: ${response.status} ${response.statusText}`,
          requiresCookie: true,
        });
      }

      const html = await response.text();

      if (
        html.includes('login') ||
        html.includes('Login') ||
        html.includes('txtUsuario') ||
        html.includes('txtPassword')
      ) {
        return NextResponse.json({
          success: false,
          error: 'Redirección a login detectada. Inicia Chrome con --remote-debugging-port=9222 o pega el HTML.',
          requiresCookie: true,
        });
      }

      const localidades = parseLocalidadesFromHtml(html);

      return NextResponse.json({
        success: true,
        localidades,
        source: 'fetch',
      });
    } catch (fetchError: any) {
      console.error('Error fetching URL:', fetchError);
      return NextResponse.json({
        success: false,
        error: `Error de conexión: ${fetchError.message || fetchError}`,
        requiresCookie: true,
      });
    }
  } catch (error: any) {
    console.error('Error en /api/extract-localidades:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error interno al procesar localidades' },
      { status: 500 }
    );
  }
}
