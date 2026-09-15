import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fetchEventosFromSheets } from '@/services/googleSheets';
import { getComparison, getSnapshotConfig, getColombiaWeekKey, saveSnapshot } from '@/services/snapshots';
import { isRunningInCloud, forwardToLocalTunnel } from '@/services/tunnelProxy';
import { verifyChromeSession } from '@/services/chromeSession';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (isRunningInCloud()) {
    return forwardToLocalTunnel(request, '/api/reports/sales');
  }

  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('forceRefresh') === 'true';
    const targetUrl = searchParams.get('targetUrl');

    const cachePath = path.join(process.cwd(), 'scratch', 'latest_sales_cache.json');

    // Si no es refresco forzado y existe caché fresco (< 30 min), devolverlo
    if (!forceRefresh && !targetUrl && fs.existsSync(cachePath)) {
      try {
        const stats = fs.statSync(cachePath);
        const ageMinutes = (Date.now() - stats.mtimeMs) / (1000 * 60);
        if (ageMinutes < 30) {
          const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
          const comparison = getComparison(cached.salesData || []);
          return NextResponse.json({
            success: true,
            cached: true,
            cacheAgeMinutes: Math.round(ageMinutes),
            comparison,
            ...cached,
          });
        }
      } catch (cacheErr) {
        console.warn('Error leyendo caché de ventas:', cacheErr);
      }
    }

    // Obtener los eventos a consultar
    let eventsToScrape: any[] = [];
    if (targetUrl) {
      eventsToScrape = [{ urlBase: targetUrl }];
    } else {
      const allEvents = await fetchEventosFromSheets();
      // Filtrar exclusivamente eventos que estén a la venta (enVenta === true) y tengan urlBase válida
      eventsToScrape = allEvents.filter((e) =>
        Boolean(
          e.urlBase &&
          e.urlBase.includes('/shows/') &&
          (e.enVenta === true || String(e.enVenta).toLowerCase() === 'true')
        )
      );
    }

    if (eventsToScrape.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No hay eventos configurados con URL base de show (/shows/...) para consultar ventas.',
      }, { status: 400 });
    }

    // Validación preventiva e instantánea de Google Chrome y sesión de QRBoletos
    const sessionStatus = await verifyChromeSession();
    if (!sessionStatus.chromeOnline) {
      return NextResponse.json(
        {
          success: false,
          code: 'CHROME_OFFLINE',
          error: 'Google Chrome no está abierto en modo depuración (puerto 9222). Inicia "Iniciar_Chrome_Boleteria.bat".',
        },
        { status: 503 }
      );
    }
    if (!sessionStatus.sessionActive) {
      return NextResponse.json(
        {
          success: false,
          code: sessionStatus.error || 'SESSION_EXPIRED',
          error: sessionStatus.message || 'Tu sesión en Google Chrome ha caducado. Por favor inicia sesión en dashboard.qrboletos.com.',
        },
        { status: 401 }
      );
    }

    const scriptPath = path.join(process.cwd(), 'scripts', 'generate_sales_report_excel.py');
    const tempExcelPath = path.join(process.cwd(), 'scratch', 'Informe_Ventas_QRBoletos.xlsx');
    const tempEventsJsonPath = path.join(process.cwd(), 'scratch', 'temp_events_to_scrape.json');

    fs.writeFileSync(tempEventsJsonPath, JSON.stringify(eventsToScrape), 'utf-8');

    const args = [
      scriptPath,
      '--events-json', tempEventsJsonPath,
      '--output-excel', tempExcelPath,
      '--json-out'
    ];

    const pythonProcess = spawn('python', args, {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    let stdoutData = '';
    let stderrData = '';

    pythonProcess.stdout.on('data', (chunk) => {
      stdoutData += chunk.toString();
    });

    pythonProcess.stderr.on('data', (chunk) => {
      stderrData += chunk.toString();
    });

    const exitCode = await new Promise<number>((resolve) => {
      pythonProcess.on('close', resolve);
    });

    if (exitCode !== 0) {
      console.error('Error ejecutando scraper de ventas:', stderrData);
      const isSessionExpired = exitCode === 41 || stderrData.includes('SESSION_EXPIRED') || stdoutData.includes('SESSION_EXPIRED');
      const isChromeOffline = stderrData.includes('CHROME_OFFLINE') || stdoutData.includes('CHROME_OFFLINE');

      return NextResponse.json(
        {
          success: false,
          code: isSessionExpired ? 'SESSION_EXPIRED' : isChromeOffline ? 'CHROME_OFFLINE' : 'SCRAPER_ERROR',
          error: isSessionExpired
            ? 'Tu sesión en Google Chrome ha caducado o está en la pantalla de login. Inicia sesión en dashboard.qrboletos.com y vuelve a intentar.'
            : isChromeOffline
            ? 'Google Chrome no respondió en el puerto 9222. Inicia Chrome con "Iniciar_Chrome_Boleteria.bat".'
            : stderrData || 'Error extrayendo ventas desde Chrome.',
        },
        { status: isSessionExpired ? 401 : isChromeOffline ? 503 : 500 }
      );
    }

    let parsed: any = {};
    try {
      // Buscar la primera línea o bloque JSON válido en la salida
      const jsonStart = stdoutData.indexOf('{');
      if (jsonStart !== -1) {
        parsed = JSON.parse(stdoutData.slice(jsonStart).trim());
      }
    } catch (e: any) {
      return NextResponse.json(
        { success: false, error: `Salida de reporte no parseable como JSON: ${stdoutData.slice(0, 300)}` },
        { status: 500 }
      );
    }

    // Guardar en caché
    try {
      fs.writeFileSync(cachePath, JSON.stringify(parsed, null, 2), 'utf-8');

      // Comprobar auto snapshot si aplica
      const config = getSnapshotConfig();
      if (config.autoSnapshotEnabled && parsed.salesData && parsed.salesData.length > 0) {
        const { weekKey, isMonday, cotDateStr } = getColombiaWeekKey();
        if (isMonday && config.lastAutoSnapshotWeek !== weekKey) {
          saveSnapshot(parsed.salesData, `Snapshot Automático Lunes ${cotDateStr}`);
        }
      }
    } catch (cacheErr) {
      console.warn('Aviso guardando caché o auto-snapshot:', cacheErr);
    }

    const comparison = getComparison(parsed.salesData || []);

    return NextResponse.json({
      success: true,
      cached: false,
      comparison,
      ...parsed,
    });
  } catch (error: any) {
    console.error('Error en /api/reports/sales:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
