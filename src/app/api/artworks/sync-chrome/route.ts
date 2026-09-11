import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fetchEventosFromSheets, isSheetsConfigured } from '@/services/googleSheets';

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

import { isRunningInCloud, forwardToLocalTunnel } from '@/services/tunnelProxy';

export async function POST(request: Request) {
  if (isRunningInCloud()) {
    return forwardToLocalTunnel(request, '/api/artworks/sync-chrome');
  }

  try {
    const body = await request.json();
    const {
      promoterId,
      eventId,
      showId,
      urlBase = null,
      digitalImage = null,
      printImage = null,
      imageHome = null,
      imageAfiche = null,
      imageBanner = null,
      eventName = null,
      eventNumericId = null,
      eventUrl = null,
      enVenta = false,
      replaceImages = true,
      sections = null,
      dryRun = false,
      cdpUrl = 'http://localhost:9222',
    } = body;

    const pId = promoterId || (urlBase ? urlBase.match(/promoters\/([^/]+)/)?.[1] : null);
    const eId = eventId || (urlBase ? urlBase.match(/events\/([^/]+)/)?.[1] : null);
    const sId = showId || (urlBase ? urlBase.match(/shows\/([^/]+)/)?.[1] : null);

    if (!pId || !eId) {
      return NextResponse.json(
        { success: false, error: 'Faltan parámetros requeridos: promoterId, eventId.' },
        { status: 400 }
      );
    }

    const hasTickets = !!(digitalImage || printImage);
    if (hasTickets && !sId) {
      return NextResponse.json(
        { success: false, error: 'Se requiere showId para sincronizar artes de boletería digital o física.' },
        { status: 400 }
      );
    }

    if (!digitalImage && !printImage && !imageHome && !imageAfiche && !imageBanner) {
      return NextResponse.json(
        { success: false, error: 'Debes adjuntar al menos un diseño o imagen para actualizar.' },
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
          error: `No se pudo conectar a Google Chrome en ${cdpUrl}. Asegúrate de arrancar Chrome con: chrome.exe --remote-debugging-port=9222 --user-data-dir="C:\\chrome-dev-profile"`,
          requiresChromeLaunch: true,
        },
        { status: 503 }
      );
    }

    // Guardar imágenes si fueron provistas
    let tempDigitalImagePath: string | null = null;
    let tempPrintImagePath: string | null = null;

    if (digitalImage && typeof digitalImage === 'string' && digitalImage.length > 20) {
      tempDigitalImagePath = saveBase64Image(digitalImage, 'digital_art');
    }
    if (printImage && typeof printImage === 'string' && printImage.length > 20) {
      tempPrintImagePath = saveBase64Image(printImage, 'print_art');
    }

    let tempImageHomePath: string | null = null;
    let tempImageAfichePath: string | null = null;
    let tempImageBannerPath: string | null = null;

    if (imageHome && typeof imageHome === 'string' && imageHome.length > 20) {
      tempImageHomePath = saveBase64Image(imageHome, 'home_promo');
    }
    if (imageAfiche && typeof imageAfiche === 'string' && imageAfiche.length > 20) {
      tempImageAfichePath = saveBase64Image(imageAfiche, 'afiche_promo');
    }
    if (imageBanner && typeof imageBanner === 'string' && imageBanner.length > 20) {
      tempImageBannerPath = saveBase64Image(imageBanner, 'banner_promo');
    }

    // Exportar lista de eventos si está disponible para ordenamiento cronológico de banners
    let eventsTempPath: string | null = null;
    try {
      if (isSheetsConfigured()) {
        const evs = await fetchEventosFromSheets();
        const scratchDir = path.join(process.cwd(), 'scratch');
        if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
        eventsTempPath = path.join(scratchDir, 'events_temp.json');
        fs.writeFileSync(eventsTempPath, JSON.stringify(evs, null, 2), 'utf-8');
      }
    } catch (e) {
      console.warn('No se pudieron consultar eventos para banners:', e);
    }

    const scriptPath = path.join(process.cwd(), 'scripts', 'update_artworks_chrome.py');

    // Preparar streaming de respuesta vía Server-Sent Events (SSE)
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const args = [
          scriptPath,
          '--cdp-url', cdpUrl,
          '--promoter-id', pId,
          '--event-id', eId,
        ];

        if (eventName) {
          args.push('--event-name', eventName);
        }
        if (eventNumericId) {
          args.push('--event-numeric-id', String(eventNumericId));
        }
        if (eventUrl) {
          args.push('--event-url', eventUrl);
        }
        if (enVenta) {
          args.push('--en-venta');
        }
        if (eventsTempPath) {
          args.push('--events-json', eventsTempPath);
        }

        if (sId) {
          args.push('--show-id', sId);
        }

        if (tempDigitalImagePath) {
          args.push('--digital-image', tempDigitalImagePath);
        }
        if (tempPrintImagePath) {
          args.push('--print-image', tempPrintImagePath);
        }
        if (tempImageHomePath) {
          args.push('--image-home', tempImageHomePath);
        }
        if (tempImageAfichePath) {
          args.push('--image-afiche', tempImageAfichePath);
        }
        if (tempImageBannerPath) {
          args.push('--image-banner', tempImageBannerPath);
        }
        if (replaceImages) {
          args.push('--replace-images');
        }
        if (sections && Array.isArray(sections) && sections.length > 0) {
          args.push('--sections-json', JSON.stringify(sections));
        }
        if (dryRun) {
          args.push('--dry-run');
        }

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'log',
              level: 'info',
              message: `Iniciando agente de actualización de artes en ${cdpUrl}...`,
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
                message: `Diseño Físico Boca/Godex 63X177 vinculado: ${path.basename(tempPrintImagePath)}`,
              })}\n\n`
            )
          );
        }

        const child = spawn('python', args, {
          env: {
            ...process.env,
            PYTHONUNBUFFERED: '1',
            PYTHONIOENCODING: 'utf-8',
          },
        });

        child.stdout.on('data', (data) => {
          const rawLines = data.toString('utf-8').split('\n');
          for (const line of rawLines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            let level: 'info' | 'success' | 'warning' | 'error' = 'info';
            let message = trimmed;

            const match = trimmed.match(/^\[(INFO|SUCCESS|WARNING|ERROR)\]\s*(?:[ℹ️✅⚠️❌•]\s*)?(.*)$/);
            if (match) {
              level = match[1].toLowerCase() as any;
              message = match[2];
            }

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'log',
                  level,
                  message,
                  timestamp: new Date().toLocaleTimeString(),
                })}\n\n`
              )
            );
          }
        });

        child.stderr.on('data', (data) => {
          const raw = data.toString('utf-8').trim();
          if (!raw) return;
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'log',
                level: 'warning',
                message: `[stderr] ${raw}`,
                timestamp: new Date().toLocaleTimeString(),
              })}\n\n`
            )
          );
        });

        child.on('close', (code) => {
          // Limpiar imágenes temporales
          try {
            if (tempDigitalImagePath && fs.existsSync(tempDigitalImagePath)) {
              fs.unlinkSync(tempDigitalImagePath);
            }
            if (tempPrintImagePath && fs.existsSync(tempPrintImagePath)) {
              fs.unlinkSync(tempPrintImagePath);
            }
          } catch (cleanupErr) {
            console.warn('Error limpiando imágenes temporales:', cleanupErr);
          }

          if (code === 0) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'finish',
                  success: true,
                  message: 'Proceso de actualización de artes finalizado con éxito.',
                })}\n\n`
              )
            );
          } else {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'finish',
                  success: false,
                  message: `El proceso finalizó con código de salida ${code}.`,
                })}\n\n`
              )
            );
          }
          controller.close();
        });

        child.on('error', (err) => {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'log',
                level: 'error',
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
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: any) {
    console.error('Error en POST /api/artworks/sync-chrome:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
