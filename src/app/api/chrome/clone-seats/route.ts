import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { isRunningInCloud, forwardToLocalTunnel } from '@/services/tunnelProxy';

export async function POST(request: Request) {
  if (isRunningInCloud()) {
    return forwardToLocalTunnel(request, '/api/chrome/clone-seats');
  }

  try {
    const body = await request.json();
    const {
      promoterId,
      eventId,
      showId,
      urlBase = null,
      dryRun = false,
      cdpUrl = 'http://localhost:9222',
      sourcePromoter = 'ARECOL',
      sourceEvent = 'PLANOS',
      sourceShow = 'PRUEBA',
    } = body;

    const pId = promoterId || (urlBase ? urlBase.match(/promoters\/([^/]+)/)?.[1] : null);
    const eId = eventId || (urlBase ? urlBase.match(/events\/([^/]+)/)?.[1] : null);
    const sId = showId || (urlBase ? urlBase.match(/shows\/([^/]+)/)?.[1] : null);

    if (!pId || !eId || !sId) {
      return NextResponse.json(
        { success: false, error: 'Faltan parámetros requeridos: promoterId, eventId, showId.' },
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
          error: `No se pudo conectar a Google Chrome en ${cdpUrl}. Inicia Chrome con puerto 9222.`,
          requiresChromeLaunch: true,
        },
        { status: 503 }
      );
    }

    const scriptPath = path.join(process.cwd(), 'scripts', 'clone_seats_chrome.py');

    // Streaming de respuesta vía Server-Sent Events (SSE)
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const args = [
          scriptPath,
          '--cdp-url', cdpUrl,
          '--promoter-id', pId,
          '--event-id', eId,
          '--show-id', sId,
          '--source-promoter', sourcePromoter,
          '--source-event', sourceEvent,
          '--source-show', sourceShow,
        ];

        if (dryRun) {
          args.push('--dry-run');
        }

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'log',
              level: 'info',
              message: `Iniciando clonación de planos de silletería en ${cdpUrl}...`,
            })}\n\n`
          )
        );

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'log',
              level: 'info',
              message: `Origen: ${sourcePromoter} -> ${sourceEvent} -> ${sourceShow}`,
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
          if (code === 0) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'finish',
                  success: true,
                  message: 'Proceso de clonación de planos completado con éxito.',
                })}\n\n`
              )
            );
          } else {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'finish',
                  success: false,
                  message: `El proceso de clonación terminó con código ${code}.`,
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
                message: `Error al ejecutar script de Python: ${err.message}`,
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
    console.error('Error en /api/chrome/clone-seats:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
