import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fetchEventosFromSheets } from '@/services/googleSheets';
import { getComparison, getSnapshotConfig, getColombiaWeekKey, saveSnapshot, getTodaySavedSnapshot, getLatestSavedSnapshot } from '@/services/snapshots';
import { isRunningInCloud, forwardToLocalTunnel } from '@/services/tunnelProxy';
import { verifyChromeSession } from '@/services/chromeSession';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export interface ScrapeJobStatus {
  status: 'idle' | 'scraping' | 'completed' | 'error';
  startedAt?: number;
  completedAt?: number;
  error?: string;
  code?: string;
  message?: string;
  data?: any;
}

const JOB_STATUS_FILE = path.join(process.cwd(), 'scratch', 'scrape_job_status.json');

function getJobStatus(): ScrapeJobStatus {
  try {
    if (fs.existsSync(JOB_STATUS_FILE)) {
      const data: ScrapeJobStatus = JSON.parse(fs.readFileSync(JOB_STATUS_FILE, 'utf-8'));
      // Timeout de seguridad: si lleva más de 3 minutos ejecutando, marcarlo como error
      if (data.status === 'scraping' && data.startedAt && Date.now() - data.startedAt > 180000) {
        data.status = 'error';
        data.code = 'SCRAPER_TIMEOUT';
        data.error = 'La extracción en Chrome superó el tiempo máximo de 3 minutos.';
        setJobStatus(data);
      }
      return data;
    }
  } catch (e) {
    console.warn('Error leyendo estado de extracción:', e);
  }
  return { status: 'idle' };
}

function setJobStatus(status: ScrapeJobStatus) {
  try {
    const scratchDir = path.join(process.cwd(), 'scratch');
    if (!fs.existsSync(scratchDir)) {
      fs.mkdirSync(scratchDir, { recursive: true });
    }
    fs.writeFileSync(JOB_STATUS_FILE, JSON.stringify(status, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Error guardando estado de extracción:', e);
  }
}

function runScraperInBackground(eventsToScrape: any[], targetUrl?: string | null) {
  const cachePath = path.join(process.cwd(), 'scratch', 'latest_sales_cache.json');
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

  pythonProcess.on('close', (exitCode) => {
    if (exitCode !== 0) {
      console.error('Error ejecutando scraper de ventas en segundo plano:', stderrData);
      const isSessionExpired = exitCode === 41 || stderrData.includes('SESSION_EXPIRED') || stdoutData.includes('SESSION_EXPIRED');
      const isChromeOffline = stderrData.includes('CHROME_OFFLINE') || stdoutData.includes('CHROME_OFFLINE');

      const errStatus: ScrapeJobStatus = {
        status: 'error',
        completedAt: Date.now(),
        code: isSessionExpired ? 'SESSION_EXPIRED' : isChromeOffline ? 'CHROME_OFFLINE' : 'SCRAPER_ERROR',
        error: isSessionExpired
          ? 'Tu sesión en Google Chrome ha caducado o está en la pantalla de login. Inicia sesión en dashboard.qrboletos.com y vuelve a intentar.'
          : isChromeOffline
          ? 'Google Chrome no respondió en el puerto 9222. Inicia Chrome con "Iniciar_Chrome_Boleteria.bat".'
          : stderrData || 'Error extrayendo ventas desde Chrome.',
      };
      setJobStatus(errStatus);
      return;
    }

    let parsed: any = {};
    try {
      const jsonStart = stdoutData.indexOf('{');
      if (jsonStart !== -1) {
        parsed = JSON.parse(stdoutData.slice(jsonStart).trim());
      }
    } catch (e: any) {
      setJobStatus({
        status: 'error',
        completedAt: Date.now(),
        code: 'PARSE_ERROR',
        error: `Salida de reporte no parseable como JSON: ${stdoutData.slice(0, 300)}`
      });
      return;
    }

    let savedSnapshotMeta = null;
    try {
      fs.writeFileSync(cachePath, JSON.stringify(parsed, null, 2), 'utf-8');

      if (parsed.salesData && parsed.salesData.length > 0 && !targetUrl) {
        savedSnapshotMeta = saveSnapshot(parsed.salesData);
      }
    } catch (cacheErr) {
      console.warn('Aviso guardando caché o snapshot diario:', cacheErr);
    }

    const comparison = getComparison(parsed.salesData || []);

    setJobStatus({
      status: 'completed',
      completedAt: Date.now(),
      data: {
        success: true,
        cached: false,
        isTodaySnapshot: false,
        snapshotLabel: savedSnapshotMeta?.label,
        snapshotId: savedSnapshotMeta?.id,
        comparison,
        ...parsed,
      }
    });
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const isStatusCheck = searchParams.get('status') === 'true';
  const forceRefresh = searchParams.get('forceRefresh') === 'true';
  const targetUrl = searchParams.get('targetUrl');

  // Consulta de estado del trabajo en segundo plano
  if (isStatusCheck) {
    if (isRunningInCloud()) {
      return forwardToLocalTunnel(request, '/api/reports/sales');
    }

    const job = getJobStatus();
    if (job.status === 'scraping') {
      const elapsed = job.startedAt ? Math.floor((Date.now() - job.startedAt) / 1000) : 0;
      return NextResponse.json({
        success: true,
        status: 'scraping',
        startedAt: job.startedAt,
        elapsedSeconds: elapsed,
        message: 'Extracción en proceso en Google Chrome...',
      });
    }

    if (job.status === 'completed') {
      return NextResponse.json({
        success: true,
        status: 'completed',
        completedAt: job.completedAt,
        ...(job.data || {}),
      });
    }

    if (job.status === 'error') {
      return NextResponse.json(
        {
          success: false,
          status: 'error',
          code: job.code || 'SCRAPER_ERROR',
          error: job.error || 'Error durante la extracción.',
        },
        { status: job.code === 'SESSION_EXPIRED' ? 401 : job.code === 'CHROME_OFFLINE' ? 503 : 500 }
      );
    }

    return NextResponse.json({
      success: true,
      status: 'idle',
    });
  }

  // En la nube (Vercel)
  if (isRunningInCloud()) {
    // Si no es refresco forzado ni evento individual, intentar entregar el snapshot de hoy
    if (!forceRefresh && !targetUrl) {
      const todaySnapshot = getTodaySavedSnapshot();
      if (todaySnapshot && todaySnapshot.salesData && todaySnapshot.salesData.length > 0) {
        const comparison = getComparison(todaySnapshot.salesData);
        const ageMinutes = Math.round((Date.now() - new Date(todaySnapshot.createdAt).getTime()) / (1000 * 60));
        return NextResponse.json({
          success: true,
          cached: true,
          isTodaySnapshot: true,
          snapshotId: todaySnapshot.id,
          snapshotLabel: todaySnapshot.label,
          snapshotCreatedAt: todaySnapshot.createdAt,
          cacheAgeMinutes: Math.max(0, ageMinutes),
          totalEvents: todaySnapshot.totalEvents || todaySnapshot.salesData.length,
          salesData: todaySnapshot.salesData,
          comparison,
        });
      }
    }

    // Reenviar al túnel local
    const tunnelResponse = await forwardToLocalTunnel(request, '/api/reports/sales');

    // Si falló el túnel y no era refresco forzado, ofrecer fallback al último snapshot disponible en el repositorio
    if (!tunnelResponse.ok && !forceRefresh && !targetUrl) {
      const latestSnapshot = getLatestSavedSnapshot();
      if (latestSnapshot && latestSnapshot.salesData && latestSnapshot.salesData.length > 0) {
        const comparison = getComparison(latestSnapshot.salesData);
        return NextResponse.json({
          success: true,
          cached: true,
          isTodaySnapshot: false,
          isFallback: true,
          fallbackNotice: 'Servidor local no disponible. Mostrando el último informe guardado.',
          snapshotId: latestSnapshot.id,
          snapshotLabel: latestSnapshot.label,
          snapshotCreatedAt: latestSnapshot.createdAt,
          totalEvents: latestSnapshot.totalEvents || latestSnapshot.salesData.length,
          salesData: latestSnapshot.salesData,
          comparison,
        });
      }
    }

    return tunnelResponse;
  }

  // En entorno local (PC)
  try {
    // 1. Si no es forzado y no es evento individual, intentar devolver snapshot de hoy
    if (!forceRefresh && !targetUrl) {
      const todaySnapshot = getTodaySavedSnapshot();
      if (todaySnapshot && todaySnapshot.salesData && todaySnapshot.salesData.length > 0) {
        const comparison = getComparison(todaySnapshot.salesData);
        const ageMinutes = Math.round((Date.now() - new Date(todaySnapshot.createdAt).getTime()) / (1000 * 60));
        return NextResponse.json({
          success: true,
          cached: true,
          isTodaySnapshot: true,
          snapshotId: todaySnapshot.id,
          snapshotLabel: todaySnapshot.label,
          snapshotCreatedAt: todaySnapshot.createdAt,
          cacheAgeMinutes: Math.max(0, ageMinutes),
          totalEvents: todaySnapshot.totalEvents || todaySnapshot.salesData.length,
          salesData: todaySnapshot.salesData,
          comparison,
        });
      }

      // Si no hay snapshot de hoy, verificar si hay un snapshot previo para no dejar la vista vacía
      const latestSnapshot = getLatestSavedSnapshot();
      if (latestSnapshot && latestSnapshot.salesData && latestSnapshot.salesData.length > 0) {
        const comparison = getComparison(latestSnapshot.salesData);
        return NextResponse.json({
          success: true,
          cached: true,
          isTodaySnapshot: false,
          snapshotId: latestSnapshot.id,
          snapshotLabel: latestSnapshot.label,
          snapshotCreatedAt: latestSnapshot.createdAt,
          totalEvents: latestSnapshot.totalEvents || latestSnapshot.salesData.length,
          salesData: latestSnapshot.salesData,
          comparison,
        });
      }
    }

    // Refresco forzado o inicial sin snapshots:
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

    // Obtener los eventos a consultar
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
      return NextResponse.json({
        success: false,
        error: 'No hay eventos configurados con URL base de show (/shows/...) para consultar ventas.',
      }, { status: 400 });
    }

    // Verificar si ya hay un proceso en ejecución
    const currentJob = getJobStatus();
    if (currentJob.status === 'scraping') {
      const elapsed = currentJob.startedAt ? Math.floor((Date.now() - currentJob.startedAt) / 1000) : 0;
      return NextResponse.json({
        success: true,
        status: 'scraping',
        startedAt: currentJob.startedAt,
        elapsedSeconds: elapsed,
        message: 'La extracción de ventas ya se encuentra en ejecución en Chrome.',
      });
    }

    // Iniciar el scraper en segundo plano para evitar timeouts HTTP en Vercel
    const startedAt = Date.now();
    setJobStatus({
      status: 'scraping',
      startedAt,
      message: 'Iniciando extracción en Google Chrome...',
    });

    runScraperInBackground(eventsToScrape, targetUrl);

    // Responder inmediatamente con 200 OK y estado "scraping"
    return NextResponse.json({
      success: true,
      status: 'scraping',
      startedAt,
      message: 'Extracción de ventas iniciada en Google Chrome en segundo plano.',
    });
  } catch (error: any) {
    console.error('Error en /api/reports/sales:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
