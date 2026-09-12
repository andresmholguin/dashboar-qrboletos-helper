import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { isRunningInCloud, forwardToLocalTunnel } from '@/services/tunnelProxy';

function saveBase64Image(dataUrl: string, prefix: string): string | null {
  try {
    const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    const base64Data = matches ? matches[2] : dataUrl;
    const buffer = Buffer.from(base64Data, 'base64');

    const uploadsDir = path.join(process.cwd(), 'scratch', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    let ext = 'png';
    if (matches && matches[1]) {
      if (matches[1].includes('jpeg') || matches[1].includes('jpg')) ext = 'jpg';
      else if (matches[1].includes('webp')) ext = 'webp';
    }

    const filePath = path.join(uploadsDir, `${prefix}_${Date.now()}.${ext}`);
    fs.writeFileSync(filePath, buffer);
    return filePath;
  } catch (err) {
    console.error(`Error guardando imagen ${prefix}:`, err);
    return null;
  }
}

export async function POST(request: Request) {
  if (isRunningInCloud()) {
    return forwardToLocalTunnel(request, '/api/events/sync-settings');
  }

  try {
    const body = await request.json();
    const {
      promoterId,
      eventId,
      settings,
      cdpUrl = 'http://localhost:9222',
    } = body;

    if (!promoterId || !eventId) {
      return NextResponse.json(
        { success: false, error: 'Faltan parámetros requeridos: promoterId, eventId.' },
        { status: 400 }
      );
    }

    if (!settings) {
      return NextResponse.json(
        { success: false, error: 'No se recibieron datos de configuración (settings).' },
        { status: 400 }
      );
    }

    // Verificar si Chrome CDP responde
    let cdpOnline = false;
    try {
      const cdpCheck = await fetch(`${cdpUrl}/json/version`, { cache: 'no-store' });
      cdpOnline = cdpCheck.ok;
    } catch {
      cdpOnline = false;
    }

    if (!cdpOnline) {
      return NextResponse.json(
        {
          success: false,
          error: `No se pudo conectar a Google Chrome en ${cdpUrl}. Verifica que Chrome esté abierto con --remote-debugging-port=9222`,
          requiresChromeLaunch: true,
        },
        { status: 503 }
      );
    }

    // Guardar imágenes si fueron provistas en base64
    const tempFilesToClean: string[] = [];
    const settingsPayload: Record<string, any> = { ...settings };

    if (settings.imageHome && typeof settings.imageHome === 'string' && settings.imageHome.startsWith('data:image')) {
      const p = saveBase64Image(settings.imageHome, 'home_miniatura');
      if (p) {
        settingsPayload.imageHome = p;
        tempFilesToClean.push(p);
      }
    }
    if (settings.imageAfiche && typeof settings.imageAfiche === 'string' && settings.imageAfiche.startsWith('data:image')) {
      const p = saveBase64Image(settings.imageAfiche, 'afiche_vertical');
      if (p) {
        settingsPayload.imageAfiche = p;
        tempFilesToClean.push(p);
      }
    }
    if (settings.imageBanner && typeof settings.imageBanner === 'string' && settings.imageBanner.startsWith('data:image')) {
      const p = saveBase64Image(settings.imageBanner, 'banner_horizontal');
      if (p) {
        settingsPayload.imageBanner = p;
        tempFilesToClean.push(p);
      }
    }

    // Guardar temporalmente el JSON de settings
    const tempDir = path.join(process.cwd(), 'scratch');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempJsonPath = path.join(tempDir, `event_settings_sync_${Date.now()}.json`);
    fs.writeFileSync(tempJsonPath, JSON.stringify(settingsPayload, null, 2), 'utf-8');
    tempFilesToClean.push(tempJsonPath);

    const scriptPath = path.join(process.cwd(), 'scripts', 'sync_event_settings_chrome.py');

    // Streaming SSE
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const args = [
          scriptPath,
          '--cdp-url', cdpUrl,
          '--promoter-id', promoterId,
          '--event-id', eventId,
          '--settings-json', tempJsonPath,
        ];

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'log',
              level: 'info',
              message: `Conectando con Google Chrome (CDP) en ${cdpUrl}...`,
            })}\n\n`
          )
        );

        const pyProcess = spawn('python', args, {
          cwd: process.cwd(),
          env: {
            ...process.env,
            PYTHONIOENCODING: 'utf-8',
          },
        });

        pyProcess.stdout.on('data', (data) => {
          const lines = data.toString().split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
              let level = 'info';
              if (trimmed.includes('[SUCCESS]')) level = 'success';
              else if (trimmed.includes('[WARNING]')) level = 'warning';
              else if (trimmed.includes('[ERROR]')) level = 'error';

              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'log',
                    level,
                    message: trimmed,
                  })}\n\n`
                )
              );
            }
          }
        });

        pyProcess.stderr.on('data', (data) => {
          const errText = data.toString().trim();
          if (errText) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'log',
                  level: 'warning',
                  message: `[STDERR] ${errText}`,
                })}\n\n`
              )
            );
          }
        });

        pyProcess.on('close', (code) => {
          // Limpiar archivos temporales
          for (const f of tempFilesToClean) {
            try {
              if (fs.existsSync(f)) fs.unlinkSync(f);
            } catch {}
          }

          if (code === 0) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'finish',
                  success: true,
                  message: 'Configuración del evento sincronizada exitosamente en QRBoletos.',
                })}\n\n`
              )
            );
          } else {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'finish',
                  success: false,
                  message: `El proceso de sincronización finalizó con código de salida ${code}.`,
                })}\n\n`
              )
            );
          }
          controller.close();
        });

        pyProcess.on('error', (err) => {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'error',
                message: `Fallo al iniciar el proceso Python: ${err.message}`,
              })}\n\n`
            )
          );
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err: any) {
    console.error('Error en POST /api/events/sync-settings:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Error interno del servidor.' },
      { status: 500 }
    );
  }
}
