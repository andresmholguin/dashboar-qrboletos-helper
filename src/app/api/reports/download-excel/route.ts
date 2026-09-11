import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fetchEventosFromSheets } from '@/services/googleSheets';

export async function GET(request: Request) {
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
        return new Response(`Error generando archivo Excel: ${stderrData}`, { status: 500 });
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
