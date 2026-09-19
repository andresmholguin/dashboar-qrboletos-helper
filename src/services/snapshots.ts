import fs from 'fs';
import path from 'path';

export interface SnapshotConfig {
  autoSnapshotEnabled: boolean;
  compareSnapshotId: string; // 'latest_monday' | 'none' | filename
  lastAutoSnapshotWeek?: string; // YYYY-WW para evitar duplicados en la misma semana
}

export interface SnapshotMetadata {
  id: string;
  filename: string;
  createdAt: string;
  label: string;
  isMonday: boolean;
  totalEvents: number;
  totalBoletos: number;
}

const SNAPSHOTS_DIR = path.join(process.cwd(), 'scratch', 'snapshots');
const CONFIG_FILE = path.join(SNAPSHOTS_DIR, 'config.json');

function ensureDir() {
  if (!fs.existsSync(SNAPSHOTS_DIR)) {
    fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  }
}

export function getSnapshotConfig(): SnapshotConfig {
  ensureDir();
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      return {
        autoSnapshotEnabled: data.autoSnapshotEnabled ?? true,
        compareSnapshotId: data.compareSnapshotId ?? 'latest_monday',
        lastAutoSnapshotWeek: data.lastAutoSnapshotWeek,
      };
    } catch {
      // fallback
    }
  }
  return {
    autoSnapshotEnabled: true,
    compareSnapshotId: 'latest_monday',
  };
}

export function saveSnapshotConfig(partial: Partial<SnapshotConfig>): SnapshotConfig {
  ensureDir();
  const current = getSnapshotConfig();
  const updated = { ...current, ...partial };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}

// Obtener identificador ISO de semana colombiana (UTC-5)
export function getColombiaWeekKey(d: Date = new Date()): { weekKey: string; isMonday: boolean; cotDateStr: string } {
  // Ajuste a hora Colombia (UTC-5)
  const cotTime = new Date(d.getTime() - 5 * 3600 * 1000);
  const year = cotTime.getUTCFullYear();
  const month = String(cotTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(cotTime.getUTCDate()).padStart(2, '0');
  const dayOfWeek = cotTime.getUTCDay(); // 1 = Monday
  const isMonday = dayOfWeek === 1;

  // Cálculo simple de número de semana del año
  const firstDay = new Date(Date.UTC(year, 0, 1));
  const pastDays = (cotTime.getTime() - firstDay.getTime()) / 86400000;
  const weekNum = Math.ceil((pastDays + firstDay.getUTCDay() + 1) / 7);

  return {
    weekKey: `${year}-W${String(weekNum).padStart(2, '0')}`,
    isMonday,
    cotDateStr: `${year}-${month}-${day}`,
  };
}

// Purgar snapshots con más de maxDays días (por defecto 7 días)
export function purgeOldSnapshots(maxDays = 7): number {
  ensureDir();
  try {
    const files = fs.readdirSync(SNAPSHOTS_DIR);
    const now = Date.now();
    const maxAgeMs = maxDays * 24 * 60 * 60 * 1000;
    let purgedCount = 0;

    for (const f of files) {
      if (f.endsWith('.json') && f !== 'config.json') {
        const filePath = path.join(SNAPSHOTS_DIR, f);
        try {
          const raw = fs.readFileSync(filePath, 'utf-8');
          const data = JSON.parse(raw);
          const createdAt = data.createdAt ? new Date(data.createdAt).getTime() : 0;
          if (createdAt && (now - createdAt > maxAgeMs)) {
            fs.unlinkSync(filePath);
            purgedCount++;
          }
        } catch {
          try { fs.unlinkSync(filePath); purgedCount++; } catch {}
        }
      }
    }
    return purgedCount;
  } catch (err) {
    console.error('Error purgando snapshots viejos:', err);
    return 0;
  }
}

function formatSnapshotLabel(date: Date, isMonday: boolean): string {
  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  
  // Usar hora Colombia (UTC-5)
  const cotDate = new Date(date.getTime() - 5 * 3600 * 1000);
  const dayName = dayNames[cotDate.getUTCDay()];
  const dayNum = cotDate.getUTCDate();
  const monthName = monthNames[cotDate.getUTCMonth()];
  
  const hours = String(date.getHours()).padStart(2, '0');
  const mins = String(date.getMinutes()).padStart(2, '0');
  
  return `${dayName} ${dayNum} ${monthName} (${hours}:${mins})`;
}

export function saveSnapshot(salesData: any[], customLabel?: string): SnapshotMetadata {
  ensureDir();
  const now = new Date();
  const { weekKey, isMonday, cotDateStr } = getColombiaWeekKey(now);
  const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  
  const id = `snapshot_${cotDateStr}_${timeStr}`;
  const filename = `${id}.json`;
  const filePath = path.join(SNAPSHOTS_DIR, filename);

  let totalBoletos = 0;
  salesData.forEach((ev) => {
    (ev.resumenLocalidades || []).forEach((l: any) => {
      const b = l.totalBoletos !== undefined ? l.totalBoletos : parseInt(String(l.vendidas || '0').replace(/[^0-9]/g, ''), 10);
      totalBoletos += b || 0;
    });
  });

  const generatedLabel = customLabel || (isMonday ? `Lunes ${cotDateStr} (00:00)` : formatSnapshotLabel(now, isMonday));

  const payload = {
    id,
    filename,
    createdAt: now.toISOString(),
    cotDate: cotDateStr,
    weekKey,
    isMonday,
    label: generatedLabel,
    totalEvents: salesData.length,
    totalBoletos,
    salesData,
  };

  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');

  // Si fue un lunes o auto-snapshot, actualizar semana
  saveSnapshotConfig({ lastAutoSnapshotWeek: weekKey });

  // Purgar snapshots de más de 7 días
  purgeOldSnapshots(7);

  return {
    id,
    filename,
    createdAt: payload.createdAt,
    label: payload.label,
    isMonday,
    totalEvents: salesData.length,
    totalBoletos,
  };
}

export function listSnapshots(): SnapshotMetadata[] {
  ensureDir();
  try {
    const files = fs.readdirSync(SNAPSHOTS_DIR);
    const snapshots: SnapshotMetadata[] = [];

    for (const f of files) {
      if (f.endsWith('.json') && f !== 'config.json') {
        try {
          const raw = fs.readFileSync(path.join(SNAPSHOTS_DIR, f), 'utf-8');
          const data = JSON.parse(raw);
          snapshots.push({
            id: data.id || f.replace('.json', ''),
            filename: f,
            createdAt: data.createdAt || '',
            label: data.label || f,
            isMonday: !!data.isMonday,
            totalEvents: data.totalEvents || (data.salesData?.length || 0),
            totalBoletos: data.totalBoletos || 0,
          });
        } catch {
          // Ignore corrupted file
        }
      }
    }

    // Ordenar descendente (más reciente primero)
    snapshots.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return snapshots;
  } catch (err) {
    console.error('Error listando snapshots:', err);
    return [];
  }
}

export function getComparison(currentSales: any[], targetSnapshotId?: string) {
  const config = getSnapshotConfig();
  const choice = targetSnapshotId || config.compareSnapshotId;

  if (choice === 'none') {
    return null;
  }

  const allSnapshots = listSnapshots();
  if (allSnapshots.length === 0) {
    return null;
  }

  let chosenSnapMeta: SnapshotMetadata | undefined;

  if (choice === 'latest_monday') {
    chosenSnapMeta = allSnapshots.find((s) => s.isMonday) || allSnapshots[allSnapshots.length - 1]; // más antiguo o lunes
  } else {
    chosenSnapMeta = allSnapshots.find((s) => s.id === choice || s.filename === choice);
  }

  if (!chosenSnapMeta) {
    chosenSnapMeta = allSnapshots[0];
  }

  if (!chosenSnapMeta) return null;

  try {
    const raw = fs.readFileSync(path.join(SNAPSHOTS_DIR, chosenSnapMeta.filename), 'utf-8');
    const snapData = JSON.parse(raw);
    const baselineEvents = snapData.salesData || [];

    let totalDeltaGlobal = 0;

    // Normalizador de cadenas
    const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    const comparisonData = currentSales.map((curEv) => {
      const curEvName = norm(curEv.meta?.evento || '');
      const curUrl = curEv.url || '';

      // Buscar evento equivalente en el snapshot
      const baseEv = baselineEvents.find((be: any) => {
        const beUrl = be.url || '';
        const beName = norm(be.meta?.evento || '');
        return (curUrl && beUrl && (curUrl.includes(beUrl) || beUrl.includes(curUrl))) || (curEvName && beName && curEvName === beName);
      });

      const isNewEvent = !baseEv;
      const baseLocs = baseEv?.resumenLocalidades || [];

      let curEventTotalBoletos = 0;
      let prevEventTotalBoletos = 0;

      const locComparisons = (curEv.resumenLocalidades || []).map((curLoc: any) => {
        const curLocName = norm(curLoc.localidad || '');
        const baseLoc = baseLocs.find((bl: any) => norm(bl.localidad || '') === curLocName);

        const curTotal = curLoc.totalBoletos !== undefined
          ? curLoc.totalBoletos
          : parseInt(String(curLoc.vendidas || '0').replace(/[^0-9]/g, ''), 10) || 0;

        const prevTotal = baseLoc
          ? (baseLoc.totalBoletos !== undefined
              ? baseLoc.totalBoletos
              : parseInt(String(baseLoc.vendidas || '0').replace(/[^0-9]/g, ''), 10) || 0)
          : 0;

        curEventTotalBoletos += curTotal;
        prevEventTotalBoletos += prevTotal;

        const delta = Math.max(0, curTotal - prevTotal);

        return {
          localidad: curLoc.localidad,
          boletosActuales: curTotal,
          boletosAnteriores: prevTotal,
          deltaSemana: delta,
        };
      });

      const evDelta = Math.max(0, curEventTotalBoletos - prevEventTotalBoletos);
      totalDeltaGlobal += evDelta;

      return {
        evento: curEv.meta?.evento,
        url: curUrl,
        isNewEvent,
        boletosActuales: curEventTotalBoletos,
        boletosAnteriores: prevEventTotalBoletos,
        deltaEvento: evDelta,
        localidades: locComparisons,
      };
    });

    return {
      baseline: {
        id: chosenSnapMeta.id,
        label: chosenSnapMeta.label,
        createdAt: chosenSnapMeta.createdAt,
      },
      totalDeltaGlobal,
      events: comparisonData,
    };
  } catch (err) {
    console.error('Error calculando comparativo:', err);
    return null;
  }
}
