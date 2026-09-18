import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fetchEventosFromSheets, isSheetsConfigured } from '@/services/googleSheets';
import { parseSpanishDateToISO } from '@/utils/dateFormatter';

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
    return forwardToLocalTunnel(request, '/api/banners/sync');
  }

  try {
    const body = await request.json();
    const {
      eventId = null,
      eventName = null,
      eventDate = null,
      eventUrl = null,
      enVenta = false,
      bannerImage = null,
      replaceImage = true,
      reorderOnly = false,
      dryRun = false,
      cdpUrl = 'http://localhost:9222',
      events = null,
    } = body;

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
          error: `No se pudo conectar a Google Chrome en ${cdpUrl}. Asegúrate de que Chrome esté abierto con depuración remota.`,
        },
        { status: 503 }
      );
    }

    let eventsList: any[] = [];
    if (Array.isArray(events) && events.length > 0) {
      eventsList = events.map(ev => ({
        ...ev,
        fecha: ev.fecha ? parseSpanishDateToISO(ev.fecha) : ''
      }));
    } else if (isSheetsConfigured()) {
      try {
        const rawEvents = await fetchEventosFromSheets();
        eventsList = rawEvents.map(ev => ({
          ...ev,
          fecha: ev.fecha ? parseSpanishDateToISO(ev.fecha) : ''
        }));
      } catch (e) {
        console.warn('No se pudieron consultar eventos de Sheets:', e);
      }
    }

    // Guardar imagen si viene en base64
    let tempBannerImagePath: string | null = null;
    if (bannerImage && typeof bannerImage === 'string' && bannerImage.length > 20) {
      if (fs.existsSync(bannerImage)) {
        tempBannerImagePath = bannerImage;
      } else {
        tempBannerImagePath = saveBase64Image(bannerImage, 'banner_web');
      }
    }

    // Guardar lista de eventos en scratch/events_temp.json
    const scratchDir = path.join(process.cwd(), 'scratch');
    if (!fs.existsSync(scratchDir)) {
      fs.mkdirSync(scratchDir, { recursive: true });
    }
    const eventsTempPath = path.join(scratchDir, 'events_temp.json');
    fs.writeFileSync(eventsTempPath, JSON.stringify(eventsList, null, 2), 'utf-8');

    const scriptPath = path.join(process.cwd(), 'scripts', 'manage_banners_chrome.py');

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const args = [
          scriptPath,
          '--cdp-url', cdpUrl,
          '--events-json', eventsTempPath,
        ];

        if (reorderOnly) {
          args.push('--reorder-only');
        } else {
          if (eventId) args.push('--event-id', String(eventId));
          if (eventName) args.push('--event-name', eventName);
          if (eventDate) args.push('--event-date', eventDate);
          if (eventUrl) args.push('--event-url', eventUrl);
          if (enVenta) args.push('--en-venta');
          if (tempBannerImagePath) args.push('--banner-image', tempBannerImagePath);
          if (replaceImage) args.push('--replace-image');
        }

        if (dryRun) {
          args.push('--dry-run');
        }

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'log',
              level: 'info',
              message: reorderOnly
                ? `Iniciando reorganización cronológica de banners en ${cdpUrl}...`
                : `Iniciando sincronización de banner para '${eventName || eventId}' en ${cdpUrl}...`,
            })}\n\n`
          )
        );

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

            const match = trimmed.match(/^\[(INFO|SUCCESS|WARNING|ERROR)\]\s*(?:[ℹ️✅⚠️❌•*\[\]iOKX!]+\s*)?(.*)$/);
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
          const text = data.toString('utf-8').trim();
          if (text) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'log',
                  level: 'warning',
                  message: text,
                  timestamp: new Date().toLocaleTimeString(),
                })}\n\n`
              )
            );
          }
        });

        child.on('close', (code) => {
          const isOk = code === 0;
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'finish',
                success: isOk,
                code,
                message: isOk
                  ? 'Sincronización de banners finalizada con éxito.'
                  : `El proceso de banners finalizó con código de error ${code}.`,
              })}\n\n`
            )
          );
          controller.close();
        });

        child.on('error', (err) => {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'log',
                level: 'error',
                message: `Error al ejecutar script: ${err.message}`,
              })}\n\n`
            )
          );
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'finish',
                success: false,
                message: err.message,
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
  } catch (error: any) {
    console.error('Error en POST /api/banners/sync:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error interno del servidor.' },
      { status: 500 }
    );
  }
}
