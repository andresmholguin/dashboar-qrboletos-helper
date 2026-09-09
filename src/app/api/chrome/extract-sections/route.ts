import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { updateEventoMetadataInSheets } from '@/services/googleSheets';
import { Localidad } from '@/types';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { targetUrl, eventId, rowId, eventName } = body;

    const scriptPath = path.join(process.cwd(), 'scripts', 'extract_localities_chrome.py');
    const args = [scriptPath];

    if (targetUrl) {
      args.push('--target-url', targetUrl);
    }
    if (eventName) {
      args.push('--event-name', eventName);
    }

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
      console.error('Error en extract_localities_chrome.py:', stderrData);
      return NextResponse.json(
        { success: false, error: stderrData || 'Error extrayendo localidades desde Chrome.' },
        { status: 500 }
      );
    }

    // Parsear salida JSON
    let parsedResult: any;
    try {
      parsedResult = JSON.parse(stdoutData.trim());
    } catch (e: any) {
      return NextResponse.json(
        { success: false, error: `Salida de Python no válida como JSON: ${stdoutData.slice(0, 300)}` },
        { status: 500 }
      );
    }

    if (!parsedResult.success) {
      return NextResponse.json(
        { success: false, error: parsedResult.error || 'Fallo en extracción de localidades.' },
        { status: 400 }
      );
    }

    const localidades = parsedResult.localidades as Localidad[];
    const { promoterId, eventId: extractedEventId, showId, urlBase } = parsedResult;

    // Si se envió eventId, rowId o nombre, autoguardar en Google Sheets (metadata + localidades)
    const targetId = rowId || eventId || eventName;
    let savedInSheets = false;
    if (targetId) {
      try {
        savedInSheets = await updateEventoMetadataInSheets(targetId, {
          promoterId,
          eventId: extractedEventId,
          showId,
          urlBase,
          localidades,
        });
      } catch (saveErr: any) {
        console.warn('No se pudo guardar automáticamente en Google Sheets:', saveErr.message);
      }
    }

    return NextResponse.json({
      success: true,
      total: localidades.length,
      localidades,
      urlBase,
      promoterId,
      eventId: extractedEventId,
      showId,
      showTitle: parsedResult.showTitle,
      savedInSheets,
    });
  } catch (error: any) {
    console.error('Error en /api/chrome/extract-sections:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
