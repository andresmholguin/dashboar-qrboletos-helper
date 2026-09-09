import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fetchEventosFromSheets } from '@/services/googleSheets';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') || 'general'; // 'general' | 'individual'
    const reportType = searchParams.get('type') || 'general'; // 'general' | 'detailed'
    const layout = searchParams.get('layout') || 'standard_portrait'; // 'standard_portrait' | 'compact_landscape' | 'onepage_portrait'
    const targetUrl = searchParams.get('targetUrl');
    const force = searchParams.get('force') === 'true';

    const cachePath = path.join(process.cwd(), 'scratch', 'latest_sales_cache.json');
    let salesJsonPath = cachePath;
    let needScrape = force || !fs.existsSync(cachePath);

    // Si hay targetUrl específico pero el caché general contiene ese evento, podemos usar el caché
    if (!needScrape && fs.existsSync(cachePath)) {
      try {
        const stats = fs.statSync(cachePath);
        const ageMinutes = (Date.now() - stats.mtimeMs) / (1000 * 60);
        if (ageMinutes > 30) {
          needScrape = true;
        }
      } catch {
        needScrape = true;
      }
    }

    if (needScrape) {
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
        return new Response('No hay eventos en venta configurados para generar el informe PDF.', { status: 400 });
      }

      const scraperScript = path.join(process.cwd(), 'scripts', 'generate_sales_report_excel.py');
      const tempExcelPath = path.join(process.cwd(), 'scratch', 'Informe_Ventas_QRBoletos.xlsx');
      const tempEventsJsonPath = path.join(process.cwd(), 'scratch', 'temp_events_pdf.json');

      fs.writeFileSync(tempEventsJsonPath, JSON.stringify(eventsToScrape), 'utf-8');

      const scrapeArgs = [
        scraperScript,
        '--events-json', tempEventsJsonPath,
        '--output-excel', tempExcelPath,
        '--json-out'
      ];

      const pythonScraper = spawn('python', scrapeArgs, {
        cwd: process.cwd(),
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      });

      let stdoutData = '';
      let stderrData = '';
      pythonScraper.stdout.on('data', (c) => { stdoutData += c.toString(); });
      pythonScraper.stderr.on('data', (c) => { stderrData += c.toString(); });

      const exitCode = await new Promise<number>((resolve) => {
        pythonScraper.on('close', resolve);
      });

      if (exitCode !== 0) {
        console.error('Error scrapeando ventas para PDF:', stderrData);
        return new Response(`Error consultando datos de ventas: ${stderrData}`, { status: 500 });
      }

      try {
        const jsonStart = stdoutData.indexOf('{');
        if (jsonStart !== -1) {
          const parsed = JSON.parse(stdoutData.slice(jsonStart).trim());
          fs.writeFileSync(cachePath, JSON.stringify(parsed, null, 2), 'utf-8');
          salesJsonPath = cachePath;
        }
      } catch (e: any) {
        return new Response(`Error parseando datos de ventas para PDF: ${e.message}`, { status: 500 });
      }
    }

    // Generar el PDF usando scripts/generate_sales_report_pdf.py
    const pdfScript = path.join(process.cwd(), 'scripts', 'generate_sales_report_pdf.py');
    const tempPdfPath = path.join(process.cwd(), 'scratch', `Informe_${mode}_${reportType}_${Date.now()}.pdf`);

    const pdfArgs = [
      pdfScript,
      '--sales-json', salesJsonPath,
      '--output-pdf', tempPdfPath,
      '--mode', mode,
      '--type', reportType,
      '--layout', layout
    ];

    if (targetUrl) {
      pdfArgs.push('--target-url', targetUrl);
    }

    const pythonPdf = spawn('python', pdfArgs, {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    let pdfStderr = '';
    pythonPdf.stderr.on('data', (c) => { pdfStderr += c.toString(); });

    const pdfExit = await new Promise<number>((resolve) => {
      pythonPdf.on('close', resolve);
    });

    if (pdfExit !== 0 || !fs.existsSync(tempPdfPath)) {
      console.error('Error generando PDF:', pdfStderr);
      return new Response(`Error generando archivo PDF: ${pdfStderr}`, { status: 500 });
    }

    const pdfBuffer = fs.readFileSync(tempPdfPath);
    // Limpiar archivo temporal en disco de forma segura
    try { fs.unlinkSync(tempPdfPath); } catch {}

    const todayStr = new Date().toISOString().split('T')[0];
    const filenamePrefix = mode === 'general' ? 'Informe_Consolidado_Ventas' : `Informe_Ventas_${reportType}`;
    const layoutLabel = layout === 'compact_landscape' ? 'Compacto' : (layout === 'onepage_portrait' ? 'Ficha' : 'Vertical');
    const filename = `${filenamePrefix}_${layoutLabel}_${todayStr}.pdf`;

    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });
  } catch (error: any) {
    console.error('Error en download-pdf:', error);
    return new Response(`Error interno: ${error.message}`, { status: 500 });
  }
}
