import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

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
  try {
    const body = await request.json();
    const {
      promoterId,
      eventId,
      showId,
      urlBase = null,
      pricingData,
      dryRun = false,
      cdpUrl = 'http://localhost:9222',
      digitalImage = null,
      printImage = null,
      replaceImages = false,
      archiveOldPrices = true,
      noConfigurePrices = false,
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

    if (!pricingData || !pricingData.localidades || pricingData.localidades.length === 0) {
      return NextResponse.json(
        { success: false, error: 'El objeto pricingData no contiene localidades válidas.' },
        { status: 400 }
      );
    }

    // Verificar si Chrome CDP responde en el puerto especificado
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
          error: `No se pudo conectar a Google Chrome en ${cdpUrl}. Asegúrate de arrancar Chrome con: chrome.exe --remote-debugging-port=9222 --user-data-dir="C:\\chrome-dev-profile"`,
          requiresChromeLaunch: true,
        },
        { status: 503 }
      );
    }

    // Guardar temporalmente el JSON de precios para el ejecutor
    const tempDir = path.join(process.cwd(), 'scratch');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempJsonPath = path.join(tempDir, `pricing_sync_${Date.now()}.json`);
    fs.writeFileSync(tempJsonPath, JSON.stringify(pricingData, null, 2), 'utf-8');

    // Guardar artes de imágenes si fueron provistos
    let tempDigitalImagePath: string | null = null;
    let tempPrintImagePath: string | null = null;

    if (digitalImage && typeof digitalImage === 'string' && digitalImage.length > 20) {
      tempDigitalImagePath = saveBase64Image(digitalImage, 'digital_ticket');
    }
    if (printImage && typeof printImage === 'string' && printImage.length > 20) {
      tempPrintImagePath = saveBase64Image(printImage, 'print_ticket');
    }

    const scriptPath = path.join(process.cwd(), 'scripts', 'sync_pricing_chrome.py');

    // Preparar streaming de respuesta vía Server-Sent Events (SSE)
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const args = [
          scriptPath,
          '--cdp-url', cdpUrl,
          '--promoter-id', pId,
          '--event-id', eId,
          '--show-id', sId,
          '--pricing-json', tempJsonPath,
        ];

        if (tempDigitalImagePath) {
          args.push('--digital-image', tempDigitalImagePath);
        }
        if (tempPrintImagePath) {
          args.push('--print-image', tempPrintImagePath);
        }
        if (replaceImages) {
          args.push('--replace-images');
        }
        if (archiveOldPrices) {
          args.push('--archive-old-prices');
        }
        if (noConfigurePrices) {
          args.push('--no-configure-prices');
        }
        if (dryRun) {
          args.push('--dry-run');
        }

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'log',
              level: 'info',
              message: `Iniciando agente Playwright en ${cdpUrl}...`,
            })}\n\n`
          )
        );

        if (tempDigitalImagePath) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'log',
                level: 'info',
                message: `Arte QRBoleto Digital vinculado: ${path.basename(tempDigitalImagePath)}`,
              })}\n\n`
            )
          );
        }
        if (tempPrintImagePath) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'log',
                level: 'info',
                message: `Arte Impresión Físico (63X177) vinculado: ${path.basename(tempPrintImagePath)}`,
              })}\n\n`
            )
          );
        }

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
          try {
            if (fs.existsSync(tempJsonPath)) {
              fs.unlinkSync(tempJsonPath);
            }
            if (tempDigitalImagePath && fs.existsSync(tempDigitalImagePath)) {
              fs.unlinkSync(tempDigitalImagePath);
            }
            if (tempPrintImagePath && fs.existsSync(tempPrintImagePath)) {
              fs.unlinkSync(tempPrintImagePath);
            }
          } catch {}

          if (code === 0) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'finish',
                  success: true,
                  message: 'Proceso de sincronización y configuración completado con éxito.',
                })}\n\n`
              )
            );
          } else {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'finish',
                  success: false,
                  message: `El proceso terminó con código de error ${code}.`,
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
                message: `Error al ejecutar el script de Python: ${err.message}`,
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
    console.error('Error en /api/pricing/sync-chrome:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
