import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fetchEventosFromSheets } from '@/services/googleSheets';
import { isRunningInCloud, forwardToLocalTunnel } from '@/services/tunnelProxy';
import { verifyChromeSession } from '@/services/chromeSession';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (isRunningInCloud()) {
    return forwardToLocalTunnel(request, '/api/reports/download-excel');
  }

  try {
    const body = await request.json();
    const targetUrls: string[] = body.targetUrls || [];

    const tempExcelPath = path.join(process.cwd(), 'scratch', 'Informe_Ventas_QRBoletos.xlsx');

    let eventsToScrape: any[] = [];
    if (targetUrls.length > 0) {
      eventsToScrape = targetUrls.map(u => ({ urlBase: u }));
    } else {
      const allEvents = await fetchEventosFromSheets();
      eventsToScrape = allEvents.filter((e) =>
        Boolean(
          e.urlBase &&
          e.urlBase.includes('/shows/') &&
          (e.enVenta === true || String(e.enVenta).toLowerCase() === 'true')
        )
      );
    }

    if (eventsToScrape.length === 0) {
      return new Response('No hay eventos con URL de show configurada para generar el informe.', { status: 400 });
    }

    const sessionStatus = await verifyChromeSession();
    if (!sessionStatus.chromeOnline) {
      return new Response(JSON.stringify({ success: false, code: 'CHROME_OFFLINE', error: 'Google Chrome no est abierto.' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }
    if (!sessionStatus.sessionActive) {
      return new Response(JSON.stringify({ success: false, code: 'SESSION_EXPIRED', error: 'Sesin caducada.' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const scriptPath = path.join(process.cwd(), 'scripts', 'generate_sales_report_excel.py');
    const tempEventsJsonPath = path.join(process.cwd(), 'scratch', 'temp_events_excel.json');
    fs.writeFileSync(tempEventsJsonPath, JSON.stringify(eventsToScrape), 'utf-8');

    const args = [scriptPath, '--events-json', tempEventsJsonPath, '--output-excel', tempExcelPath];
    const pythonProcess = spawn('python', args, { cwd: process.cwd(), env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });

    let stderrData = '';
    pythonProcess.stderr.on('data', (c) => { stderrData += c.toString(); });

    const exitCode = await new Promise<number>((resolve) => { pythonProcess.on('close', resolve); });

    if (exitCode !== 0 || !fs.existsSync(tempExcelPath)) {
      return new Response(JSON.stringify({ success: false, error: stderrData || 'Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const fileBuffer = fs.readFileSync(tempExcelPath);
    const filename = 'Informe_Ventas_QRBoletos.xlsx';
    return new Response(fileBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename=' + filename,
        'Content-Length': fileBuffer.length.toString(),
      },
    });
  } catch (error: any) {
    return new Response(`Error interno: ${error.message}`, { status: 500 });
  }
}

export async function GET(request: Request) {
  if (isRunningInCloud()) {
    return forwardToLocalTunnel(request, '/api/reports/download-excel');
  }

  try {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('targetUrl');

    const tempExcelPath = path.join(process.cwd(), 'scratch', 'Informe_Ventas_QRBoletos.xlsx');

    // Si no se pide regeneración y el archivo ya existe y es reciente (< 15 min), descargarlo directamente
    const force = searchParams.get('force') === 'true';
    let fileExistsAndFresh = false;
    if (!force && !targetUrl && fs.existsSync(tempExcelPath)) {
      const stats = fs.statSync(tempExcelPath);
      const ageMinutes = (Date.now() - stats.mtimeMs) / (1000 * 60);
      if (ageMinutes < 15) {
        fileExistsAndFresh = true;
      }
    }

    if (!fileExistsAndFresh) {
      let eventsToScrape: any[] = [];
      if (targetUrl) {
        eventsToScrape = [{ urlBase: targetUrl }];
      } else {
        const allEvents = await fetchEventosFromSheets();
        eventsToScrape = allEvents.filter((e) =>
          Boolean(
            e.urlBase &&
            e.urlBase.includes('/shows/') &&
            (e.enVenta === true || String(e.enVenta).toLowerCase() === 'true')
          )
        );
      }

      if (eventsToScrape.length === 0) {
        return new Response('No hay eventos con URL de show configurada para generar el informe.', { status: 400 });
      }

      // Validación preventiva e instantánea de Google Chrome y sesión de QRBoletos
      const sessionStatus = await verifyChromeSession();
      if (!sessionStatus.chromeOnline) {
        return new Response(
          JSON.stringify({
            success: false,
            code: 'CHROME_OFFLINE',
            error: 'Google Chrome no está abierto en modo depuración (puerto 9222). Inicia "Iniciar_Chrome_Boleteria.bat".',
          }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (!sessionStatus.sessionActive) {
        return new Response(
          JSON.stringify({
            success: false,
            code: sessionStatus.error || 'SESSION_EXPIRED',
            error: sessionStatus.message || 'Tu sesión en Google Chrome ha caducado. Por favor inicia sesión en dashboard.qrboletos.com.',
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const scriptPath = path.join(process.cwd(), 'scripts', 'generate_sales_report_excel.py');
      const tempEventsJsonPath = path.join(process.cwd(), 'scratch', 'temp_events_excel.json');

      fs.writeFileSync(tempEventsJsonPath, JSON.stringify(eventsToScrape), 'utf-8');

      const args = [
        scriptPath,
        '--events-json', tempEventsJsonPath,
        '--output-excel', tempExcelPath
      ];

      const pythonProcess = spawn('python', args, {
        cwd: process.cwd(),
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      });

      let stderrData = '';
      pythonProcess.stderr.on('data', (c) => { stderrData += c.toString(); });

      const exitCode = await new Promise<number>((resolve) => {
        pythonProcess.on('close', resolve);
      });

      if (exitCode !== 0 || !fs.existsSync(tempExcelPath)) {
        const isSessionExpired = exitCode === 41 || stderrData.includes('SESSION_EXPIRED');
        const isChromeOffline = stderrData.includes('CHROME_OFFLINE');

        return new Response(
          JSON.stringify({
            success: false,
            code: isSessionExpired ? 'SESSION_EXPIRED' : isChromeOffline ? 'CHROME_OFFLINE' : 'SCRAPER_ERROR',
            error: isSessionExpired
              ? 'Tu sesión en Google Chrome ha caducado o está en la pantalla de login. Inicia sesión en dashboard.qrboletos.com y vuelve a intentar.'
              : isChromeOffline
              ? 'Google Chrome no respondió en el puerto 9222. Inicia Chrome con "Iniciar_Chrome_Boleteria.bat".'
              : stderrData || 'Error generando archivo Excel desde Chrome.',
          }),
          {
            status: isSessionExpired ? 401 : isChromeOffline ? 503 : 500,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
    }

    const fileBuffer = fs.readFileSync(tempExcelPath);
    const todayStr = new Date().toISOString().split('T')[0];
    const filename = `Informe_Ventas_QRBoletos_${todayStr}.xlsx`;

    return new Response(fileBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': fileBuffer.length.toString(),
      },
    });
  } catch (error: any) {
    console.error('Error en download-excel:', error);
    return new Response(`Error interno: ${error.message}`, { status: 500 });
  }
}
