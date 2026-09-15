import { NextResponse } from 'next/server';
import { getTunnelConfigFromSheets, saveTunnelConfigToSheets } from '@/services/googleSheets';
import { isRunningInCloud } from '@/services/tunnelProxy';
import { verifyChromeSession } from '@/services/chromeSession';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';
    const isLocalDirect = searchParams.get('local') === 'true' || !isRunningInCloud();

    if (isLocalDirect) {
      // Consulta directa en el PC local (o petición delegada desde Vercel con ?local=true)
      const sessionStatus = await verifyChromeSession();
      return NextResponse.json({
        success: true,
        isOnline: true,
        chromeOnline: sessionStatus.chromeOnline,
        sessionActive: sessionStatus.sessionActive,
        sessionError: sessionStatus.error,
        sessionMessage: sessionStatus.message,
        currentUrl: sessionStatus.currentUrl,
      });
    }

    // Consulta en la nube (Vercel): consultar Google Sheets y verificar estado en el PC local vía túnel
    const config = await getTunnelConfigFromSheets(force);

    let isOnline = false;
    let chromeOnline = false;
    let sessionActive = false;
    let sessionMessage = '';
    let sessionError = '';

    if (config.url) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4500);
        const testRes = await fetch(`${config.url}/api/tunnel?local=true`, {
          method: 'GET',
          signal: controller.signal,
          headers: { 'User-Agent': 'VercelTunnelHealthCheck' },
        });
        clearTimeout(timeout);
        if (testRes.ok) {
          isOnline = true;
          const localData = await testRes.json().catch(() => ({}));
          chromeOnline = !!localData.chromeOnline;
          sessionActive = !!localData.sessionActive;
          sessionMessage = localData.sessionMessage || '';
          sessionError = localData.sessionError || '';
        }
      } catch {
        isOnline = false;
      }
    }

    return NextResponse.json({
      success: true,
      url: config.url,
      updatedAt: config.updatedAt,
      isOnline,
      chromeOnline,
      sessionActive,
      sessionError,
      sessionMessage,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ success: false, error: 'URL requerida.' }, { status: 400 });
    }

    const config = await saveTunnelConfigToSheets(url);
    return NextResponse.json({
      success: true,
      message: 'Túnel registrado exitosamente en Google Sheets.',
      config,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
