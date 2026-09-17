import { NextRequest, NextResponse } from 'next/server';
import { QrboletosApiClient, flattenCatalogItems } from '@/lib/qrboletosApi';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const showId = searchParams.get('id') || undefined;
    const eventName = searchParams.get('name') || undefined;

    // Permitir pasar credenciales temporales si el usuario las provee desde la UI
    const customClientId = searchParams.get('clientId') || undefined;
    const customClientSecret = searchParams.get('clientSecret') || undefined;

    const client = new QrboletosApiClient({
      scope: 'catalog',
      clientId: customClientId,
      clientSecret: customClientSecret,
    });

    if (!client.hasCredentials('catalog')) {
      return NextResponse.json(
        {
          success: false,
          code: 'MISSING_CREDENTIALS',
          error: 'Credenciales de Catálogo no configuradas. Proporciona QRBOLETOS_CATALOG_CLIENT_ID y QRBOLETOS_CATALOG_CLIENT_SECRET (o QRBOLETOS_CLIENT_ID / QRBOLETOS_CLIENT_SECRET) en .env.local o mediante la interfaz.',
        },
        { status: 400 }
      );
    }

    // 1. Si no se especificó ID, devolver la lista completa del catálogo
    if (!showId) {
      const catalog = await client.getCatalog();
      return NextResponse.json({ success: true, data: catalog.data.items });
    }

    // 2. Intentar consultar directamente el showId
    try {
      const showDetail = await client.getCatalogShowDetail(showId);
      return NextResponse.json({ success: true, data: showDetail.data });
    } catch (err: any) {
      // 3. Si el ID no existe en la API (p. ej. es el ID del scraper o Google Sheets), buscar por nombre en el catálogo activo
      const catalog = await client.getCatalog();
      const rawCatalogItems = catalog.data?.items || [];
      const flatShows = flattenCatalogItems(rawCatalogItems);

      if (eventName) {
        const clean = (s: string) =>
          s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
        const targetClean = clean(eventName);

        // Buscar coincidencia exacta o parcial en el nombre del evento o del espectáculo
        const matched = flatShows.find((show) => {
          const eventClean = clean(show.evento || '');
          const espClean = clean(show.espectaculo || '');
          return (
            eventClean === targetClean ||
            eventClean.includes(targetClean) ||
            targetClean.includes(eventClean) ||
            (espClean && (espClean.includes(targetClean) || targetClean.includes(espClean)))
          );
        });

        if (matched) {
          const resolvedDetail = await client.getCatalogShowDetail(matched.id_evento_espectaculo);
          return NextResponse.json({
            success: true,
            data: resolvedDetail.data,
            resolvedShowId: matched.id_evento_espectaculo,
            catalogItems: flatShows,
          });
        }
      }

      return NextResponse.json(
        {
          success: false,
          code: 'SHOW_NOT_FOUND',
          error: `El show ${showId} no está activo en el catálogo de QRBoletos.`,
          catalogItems: flatShows,
        },
        { status: 404 }
      );
    }
  } catch (error: any) {
    console.error('Error en /api/catalog:', error);
    return NextResponse.json(
      {
        success: false,
        code: 'API_ERROR',
        error: error.message || 'Error comunicando con la API de Catalogo de QRBoletos.',
      },
      { status: 500 }
    );
  }
}
