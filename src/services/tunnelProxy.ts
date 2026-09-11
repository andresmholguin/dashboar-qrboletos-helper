import { NextResponse } from 'next/server';
import { getTunnelConfigFromSheets } from './googleSheets';

/**
 * Retorna true si la petición se está ejecutando en la nube (Vercel) y debe redirigirse al PC local.
 */
export function isRunningInCloud(): boolean {
  return !!process.env.VERCEL;
}

/**
 * Reenvía la petición HTTP entrante hacia el PC local a través del túnel registrado en Google Sheets.
 */
export async function forwardToLocalTunnel(request: Request, pathname: string): Promise<Response> {
  try {
    const config = await getTunnelConfigFromSheets();
    const tunnelUrl = config.url?.trim().replace(/\/+$/, '');

    if (!tunnelUrl) {
      return NextResponse.json(
        {
          error: 'PC Local no conectado',
          message: 'No hay ningún túnel registrado en Google Sheets. Inicia "Iniciar_Tunel_Local.bat" en tu PC.',
          code: 'TUNNEL_NOT_FOUND',
        },
        { status: 503 }
      );
    }

    const { search } = new URL(request.url);
    const targetUrl = `${tunnelUrl}${pathname}${search}`;

    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('connection');

    let body: any = null;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      try {
        body = await request.arrayBuffer();
      } catch {}
    }

    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      // @ts-ignore
      duplex: body ? 'half' : undefined,
    });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('content-encoding');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: 'Error comunicando con el PC local',
        message: `No se pudo conectar con el túnel local: ${err.message}. Asegúrate de que el script del túnel y la app estén corriendo en tu PC.`,
        code: 'TUNNEL_CONNECTION_FAILED',
      },
      { status: 502 }
    );
  }
}
