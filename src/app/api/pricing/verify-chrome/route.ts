import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { isRunningInCloud, forwardToLocalTunnel } from '@/services/tunnelProxy';

export async function POST(request: Request) {
  if (isRunningInCloud()) {
    return forwardToLocalTunnel(request, '/api/pricing/verify-chrome');
  }

  try {
    const body = await request.json();
    const {
      promoterId,
      eventId,
      showId,
      urlBase = null,
      pricingData = null,
      dryRun = false,
      cdpUrl = 'http://localhost:9222',
      workers = 3,
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

    let tempJsonPath: string | null = null;
    if (pricingData && pricingData.localidades && pricingData.localidades.length > 0) {
      const tempDir = path.join(process.cwd(), 'scratch');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      tempJsonPath = path.join(tempDir, `verify_pricing_${Date.now()}.json`);
      fs.writeFileSync(tempJsonPath, JSON.stringify(pricingData, null, 2), 'utf-8');
    }

    const scriptPath = path.join(process.cwd(), 'scripts', 'sync_pricing_chrome.py');

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
          '--sweep-only',
        ];

        if (tempJsonPath) {
          args.push('--pricing-json', tempJsonPath);
        }
        if (dryRun) {
          args.push('--dry-run');
        }
        args.push('--workers', String(workers || 3));

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'log',
              level: 'info',
              message: `Iniciando barrido y verificación en ${cdpUrl}...`,
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
          try {
            if (tempJsonPath && fs.existsSync(tempJsonPath)) {
              fs.unlinkSync(tempJsonPath);
            }
          } catch {}

          if (code === 0) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'finish',
                  success: true,
                  message: 'Barrido y verificación completado con éxito.',
                })}\n\n`
              )
            );
          } else {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'finish',
                  success: false,
                  message: `El proceso de verificación terminó con código ${code}.`,
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
    console.error('Error en /api/pricing/verify-chrome:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
