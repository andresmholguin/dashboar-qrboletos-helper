import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { isRunningInCloud, forwardToLocalTunnel } from '@/services/tunnelProxy';

export async function POST(request: Request) {
  if (isRunningInCloud()) {
    return forwardToLocalTunnel(request, '/api/events/fetch-settings');
  }

  try {
    const body = await request.json();
    const {
      promoterId,
      eventId,
      cdpUrl = 'http://localhost:9222',
    } = body;

    if (!promoterId || !eventId) {
      return NextResponse.json(
        { success: false, error: 'Faltan parámetros requeridos: promoterId, eventId.' },
        { status: 400 }
      );
    }

    // Comprobar disponibilidad de Chrome CDP
    try {
      const cdpCheck = await fetch(`${cdpUrl}/json/version`, { cache: 'no-store' });
      if (!cdpCheck.ok) {
        return NextResponse.json(
          { success: false, error: 'Chrome CDP no responde.', cdpOffline: true },
          { status: 200 }
        );
      }
    } catch {
      return NextResponse.json(
        { success: false, error: `Chrome offline en ${cdpUrl}.`, cdpOffline: true },
        { status: 200 }
      );
    }

    const scriptPath = path.join(process.cwd(), 'scripts', 'fetch_event_settings_chrome.py');

    return new Promise<NextResponse>((resolve) => {
      const pyProcess = spawn('python', [
        scriptPath,
        '--cdp-url', cdpUrl,
        '--promoter-id', promoterId,
        '--event-id', eventId,
      ]);

      let stdout = '';
      let stderr = '';

      pyProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pyProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pyProcess.on('close', (code) => {
        const marker = '###JSON_OUTPUT###';
        const markerIndex = stdout.indexOf(marker);

        if (markerIndex !== -1) {
          try {
            const rawJson = stdout.slice(markerIndex + marker.length).trim();
            const parsed = JSON.parse(rawJson);
            resolve(NextResponse.json(parsed));
            return;
          } catch (e: any) {
            console.error('Error parseando JSON de fetch_event_settings:', e);
          }
        }

        if (code === 0) {
          resolve(
            NextResponse.json({
              success: false,
              error: 'No se pudo leer la salida JSON del agente de Chrome.',
              details: stderr,
            })
          );
        } else {
          resolve(
            NextResponse.json({
              success: false,
              error: `El script finalizó con código ${code}`,
              details: stderr,
            })
          );
        }
      });
    });
  } catch (error: any) {
    console.error('Error en API /api/events/fetch-settings:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
