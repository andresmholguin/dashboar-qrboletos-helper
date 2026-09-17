import { NextRequest, NextResponse } from 'next/server';
import { QrboletosApiClient, flattenCatalogItems } from '@/lib/qrboletosApi';

// Caché en memoria del servidor para el resumen de aforos (45s)
let summaryCache: { data: Record<string, any>; expiresAt: number } | null = null;

const clean = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const showId = searchParams.get('id') || undefined;
    const eventName = searchParams.get('name') || undefined;
    const isSummary = searchParams.get('summary') === 'true';

    const client = new QrboletosApiClient({
      scope: 'catalog',
    });

    if (!client.hasCredentials('catalog')) {
      return NextResponse.json(
        {
          success: false,
          code: 'MISSING_CREDENTIALS',
          error: 'Credenciales de Catálogo no configuradas en las Variables de Entorno (QRBOLETOS_CATALOG_CLIENT_ID / QRBOLETOS_CATALOG_CLIENT_SECRET).',
        },
        { status: 400 }
      );
    }

    // 0. Si se solicita el resumen completo de aforos para todos los eventos del catálogo
    if (isSummary) {
      if (summaryCache && summaryCache.expiresAt > Date.now()) {
        return NextResponse.json({ success: true, data: summaryCache.data, cached: true });
      }

      const catalog = await client.getCatalog();
      const rawCatalogItems = catalog.data?.items || [];
      const flatShows = flattenCatalogItems(rawCatalogItems);

      const detailsResults = await Promise.allSettled(
        flatShows.map((s) => client.getCatalogShowDetail(s.id_evento_espectaculo))
      );

      const summaryMap: Record<string, any> = {};

      detailsResults.forEach((res, idx) => {
        const s = flatShows[idx];
        if (res.status === 'fulfilled' && res.value.ok && res.value.data) {
          const d = res.value.data;
          const totalAforo = d.localidades?.reduce((acc, l) => acc + (l.aforo || 0), 0) || 0;
          const totalDisponibles = d.localidades?.reduce((acc, l) => acc + (l.disponibles || 0), 0) || 0;
          const totalVendidos = Math.max(0, totalAforo - totalDisponibles);
          const porcentaje = totalAforo > 0 ? Math.round((totalVendidos / totalAforo) * 100) : 0;

          // Consolidar localidades duplicadas (ej. secciones inactivas con aforo 0 y activas con aforo > 0)
          const locMap = new Map<string, { nombre: string; aforo: number; disponibles: number }>();
          for (const l of d.localidades || []) {
            const norm = clean(l.localidad || '');
            if (!norm) continue;
            if (!locMap.has(norm)) {
              locMap.set(norm, {
                nombre: l.localidad,
                aforo: l.aforo || 0,
                disponibles: l.disponibles || 0,
              });
            } else {
              const prev = locMap.get(norm)!;
              prev.aforo += (l.aforo || 0);
              prev.disponibles += (l.disponibles || 0);
            }
          }

          const consolidatedLocalidades = Array.from(locMap.values()).map((l) => {
            const vendidos = Math.max(0, l.aforo - l.disponibles);
            const pct = l.aforo > 0 ? Math.round((vendidos / l.aforo) * 100) : 0;
            return {
              nombre: l.nombre,
              aforo: l.aforo,
              disponibles: l.disponibles,
              vendidos,
              porcentaje: pct,
            };
          });

          const summaryItem = {
            showId: d.id_evento_espectaculo,
            idEvento: s.id_evento,
            evento: d.evento,
            espectaculo: d.espectaculo,
            totalAforo,
            totalDisponibles,
            totalVendidos,
            porcentaje,
            localidades: consolidatedLocalidades,
          };

          // Indexar por showId
          summaryMap[String(d.id_evento_espectaculo)] = summaryItem;
          // Indexar por id_evento
          if (s.id_evento) {
            summaryMap[String(s.id_evento)] = summaryItem;
          }
          // Indexar por nombre normalizado
          const eventClean = clean(d.evento || '');
          if (eventClean) {
            summaryMap[eventClean] = summaryItem;
          }
        }
      });

      summaryCache = { data: summaryMap, expiresAt: Date.now() + 45 * 1000 };
      return NextResponse.json({ success: true, data: summaryMap });
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
