import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import {
  getSnapshotConfig,
  saveSnapshotConfig,
  saveSnapshot,
  listSnapshots,
  getComparison,
} from '@/services/snapshots';
import { isRunningInCloud, forwardToLocalTunnel } from '@/services/tunnelProxy';

export async function GET(request: Request) {
  if (isRunningInCloud()) {
    return forwardToLocalTunnel(request, '/api/reports/snapshots');
  }

  try {
    const config = getSnapshotConfig();
    const snapshots = listSnapshots();

    // Obtener ventas actuales desde el caché para ver si se puede calcular comparación previa
    let comparison = null;
    const cachePath = path.join(process.cwd(), 'scratch', 'latest_sales_cache.json');
    if (fs.existsSync(cachePath)) {
      try {
        const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
        const salesData = cache.salesData || [];
        if (salesData.length > 0) {
          comparison = getComparison(salesData);
        }
      } catch (err) {
        console.warn('No se pudo calcular comparativo inicial:', err);
      }
    }

    return NextResponse.json({
      success: true,
      config,
      snapshots,
      comparison,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Error consultando snapshots' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (isRunningInCloud()) {
    return forwardToLocalTunnel(request, '/api/reports/snapshots');
  }

  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'toggle_auto') {
      const enabled = Boolean(body.enabled);
      const updated = saveSnapshotConfig({ autoSnapshotEnabled: enabled });
      return NextResponse.json({ success: true, config: updated });
    }

    if (action === 'set_compare') {
      const compareId = String(body.compareId || 'latest_monday');
      const updated = saveSnapshotConfig({ compareSnapshotId: compareId });

      // Recalcular con caché actual si existe
      let comparison = null;
      const cachePath = path.join(process.cwd(), 'scratch', 'latest_sales_cache.json');
      if (fs.existsSync(cachePath)) {
        try {
          const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
          comparison = getComparison(cache.salesData || [], compareId);
        } catch {}
      }

      return NextResponse.json({ success: true, config: updated, comparison });
    }

    if (action === 'take_snapshot') {
      // Guardar captura con datos de ventas enviados o desde el caché
      let salesData = body.salesData;
      if (!salesData || !Array.isArray(salesData) || salesData.length === 0) {
        const cachePath = path.join(process.cwd(), 'scratch', 'latest_sales_cache.json');
        if (fs.existsSync(cachePath)) {
          try {
            const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
            salesData = cache.salesData || [];
          } catch {}
        }
      }

      if (!salesData || salesData.length === 0) {
        return NextResponse.json(
          { success: false, error: 'No hay datos de ventas disponibles para guardar la instantánea.' },
          { status: 400 }
        );
      }

      const meta = saveSnapshot(salesData, body.label);
      const snapshots = listSnapshots();
      const comparison = getComparison(salesData);

      return NextResponse.json({
        success: true,
        message: 'Instantánea de ventas guardada exitosamente.',
        snapshot: meta,
        snapshots,
        comparison,
      });
    }

    if (action === 'delete_snapshot') {
      const { filename } = body;
      if (!filename || filename.includes('..') || filename === 'config.json') {
        return NextResponse.json({ success: false, error: 'Nombre de archivo inválido' }, { status: 400 });
      }
      const filePath = path.join(process.cwd(), 'scratch', 'snapshots', filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      const snapshots = listSnapshots();
      return NextResponse.json({ success: true, snapshots });
    }

    return NextResponse.json({ success: false, error: 'Acción no soportada' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Error procesando solicitud de snapshots' },
      { status: 500 }
    );
  }
}
