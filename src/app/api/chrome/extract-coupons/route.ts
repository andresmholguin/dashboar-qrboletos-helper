import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { isRunningInCloud, forwardToLocalTunnel } from '@/services/tunnelProxy';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (isRunningInCloud()) {
    return forwardToLocalTunnel(request, '/api/chrome/extract-coupons');
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { showUrl, sections, openInChrome = true } = body;

    if (!showUrl) {
      return NextResponse.json(
        { success: false, error: 'Falta el parámetro showUrl.' },
        { status: 400 }
      );
    }

    const scriptPath = path.join(process.cwd(), 'scripts', 'extract_coupon_urls_chrome.py');
    const args = [scriptPath, '--show-url', showUrl];

    if (openInChrome) {
      args.push('--open-in-chrome');
    }

    if (sections && Array.isArray(sections) && sections.length > 0) {
      args.push('--sections-json', JSON.stringify(sections));
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
      console.error('Error en extract_coupon_urls_chrome.py:', stderrData);
      return NextResponse.json(
        { success: false, error: stderrData || 'Error extrayendo URLs de descuentos desde Chrome.' },
        { status: 500 }
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(stdoutData.trim());
    } catch (e: any) {
      return NextResponse.json(
        { success: false, error: `Salida de Python no válida como JSON: ${stdoutData.slice(0, 300)}` },
        { status: 500 }
      );
    }

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, code: parsed.code, error: parsed.error || 'Fallo extrayendo cupones.' },
        { status: parsed.code === 'CHROME_OFFLINE' ? 503 : 400 }
      );
    }

    return NextResponse.json(parsed);
  } catch (error: any) {
    console.error('Error en /api/chrome/extract-coupons:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
