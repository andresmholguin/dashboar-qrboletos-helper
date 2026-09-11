import { google } from 'googleapis';
import { Evento, Localidad } from '../types';
import { parseSpanishDateToISO } from '../utils/dateFormatter';

// Rango para la consulta y escritura en Sheets
const SHEET_NAME = 'Eventos';
const RANGE = `${SHEET_NAME}!A:O`;
const FIRESTORE_URL = 'https://firestore.googleapis.com/v1/projects/api-qrboletos/databases/(default)/documents/api_cache/eventos_actuales';

export const SHEET_HEADERS = [
  'ID',
  'Nombre del evento',
  'Fecha',
  'Promoter ID',
  'Event ID',
  'Show ID',
  'URL base',
  'Fecha de creación',
  'Favorito',
  'Localidades',
  'Imagen',
  'Enlace',
  'Estado Venta',
  'Espectáculo',
  'Sitio',
];

/**
 * Retorna true si las credenciales de Google Sheets están configuradas.
 */
export function isSheetsConfigured(): boolean {
  return !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_PRIVATE_KEY &&
    process.env.GOOGLE_SHEET_ID
  );
}

/**
 * Obtiene la instancia autenticada de Google Sheets.
 */
function getSheetsInstance() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n').replace(/^"(.*)"$/, '$1');

  if (!email || !privateKey) {
    throw new Error('Google Sheets API credentials are not properly set up in environment variables.');
  }

  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

/**
 * Inicializa o actualiza la hoja de cálculo con los encabezados estándar.
 */
async function initializeSheet(sheets: any, spreadsheetId: string) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAME}!A1:L1`,
    });

    if (!response.data.values || response.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET_NAME}!A1:L1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [SHEET_HEADERS],
        },
      });
      console.log('Hoja inicializada con encabezados.');
    }
  } catch (error: any) {
    console.error('Error al inicializar la hoja:', error.message);
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: SHEET_NAME,
                },
              },
            },
          ],
        },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET_NAME}!A1:L1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [SHEET_HEADERS],
        },
      });
    } catch (sheetCreateError: any) {
      console.error('No se pudo crear la pestaña "Eventos":', sheetCreateError.message);
    }
  }
}

/**
 * Obtiene todos los eventos guardados en la hoja de Google Sheets.
 */
export async function fetchEventosFromSheets(): Promise<Evento[]> {
  if (!isSheetsConfigured()) {
    throw new Error('Google Sheets no está configurado.');
  }

  const sheets = getSheetsInstance();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID!;

  await initializeSheet(sheets, spreadsheetId);

  let response;
  try {
    response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: RANGE,
    });
  } catch (error) {
    response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'A:L',
    });
  }

  const rows = response.data.values;
  if (!rows || rows.length <= 1) {
    return [];
  }

  const eventos: Evento[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    // Detectar si la fila tiene el formato nuevo (Columna A = ID) o legado (Columna A = Nombre)
    // Si row[0] es un número de ID (ej: "2991"), es el formato nuevo.
    const isNewFormat = row.length >= 10 && (/^\d+$/.test(row[0]) || rows[0][0] === 'ID');

    let idVal = '';
    let nombreVal = '';
    let fechaVal = '';
    let promoterVal = '';
    let eventIdVal = '';
    let showIdVal = '';
    let urlBaseVal = '';
    let fechaCreacionVal = '';
    let favoritoVal = false;
    let localidadesRaw = '';
    let imageVal = '';
    let enlaceVal = '';

    if (isNewFormat) {
      // Formato Nuevo (A: ID, B: Nombre, C: Fecha, D: Promoter, E: Event, F: Show, G: URL Base, H: Creación, I: Favorito, J: Localidades, K: Imagen, L: Enlace)
      idVal = row[0] || (i + 1).toString();
      nombreVal = row[1] || 'Evento sin nombre';
      fechaVal = row[2] || '';
      promoterVal = row[3] || '';
      eventIdVal = row[4] || '';
      showIdVal = row[5] || '';
      urlBaseVal = row[6] || '';
      fechaCreacionVal = row[7] || '';
      favoritoVal = row[8] === 'SI';
      localidadesRaw = row[9] || '';
      imageVal = row[10] || '';
      enlaceVal = row[11] || '';
    } else {
      // Formato legado (A: Nombre, B: Fecha, C: Promoter, D: Event, E: Show, F: URL Base, G: Creación, H: Favorito, I: Localidades, J: Imagen)
      idVal = (i + 1).toString();
      nombreVal = row[0] || 'Evento sin nombre';
      fechaVal = row[1] || '';
      promoterVal = row[2] || '';
      eventIdVal = row[3] || '';
      showIdVal = row[4] || '';
      urlBaseVal = row[5] || '';
      fechaCreacionVal = row[6] || '';
      favoritoVal = row[7] === 'SI';
      localidadesRaw = row[8] || '';
      imageVal = row[9] || '';
    }

    let localidadesParsed: Localidad[] | undefined = undefined;
    if (localidadesRaw) {
      try {
        const parsed = JSON.parse(localidadesRaw);
        if (Array.isArray(parsed)) {
          const seen = new Set<string>();
          localidadesParsed = parsed.filter((loc: any) => {
            const idKey = (loc.id || '').toUpperCase().trim();
            const nameKey = (loc.nombre || '').toUpperCase().trim();
            if (idKey && seen.has(idKey)) return false;
            if (nameKey && seen.has(nameKey)) return false;
            if (idKey) seen.add(idKey);
            if (nameKey) seen.add(nameKey);
            return true;
          });
        }
      } catch (e) {
        console.error('Error parseando localidades JSON:', e);
      }
    }

    let estadoVentaRaw = row[12] || '';
    let espectaculoVal = row[13] || '';
    let sitioVal = row[14] || '';

    let enVenta = false;
    if (estadoVentaRaw.toUpperCase().includes('VENTA')) {
      enVenta = true;
    } else if (estadoVentaRaw.toUpperCase().includes('CONFIGURACION') || estadoVentaRaw.toUpperCase().includes('BORRADOR')) {
      enVenta = false;
    } else {
      // Fallback para filas legacy: si tiene enlace público con /event/, está a la venta
      enVenta = Boolean(enlaceVal && enlaceVal.includes('qrboletos.com/event'));
    }

    eventos.push({
      id: idVal,
      rowId: (i + 1).toString(),
      nombre: nombreVal,
      fecha: fechaVal,
      promoterId: promoterVal,
      eventId: eventIdVal,
      showId: showIdVal,
      urlBase: urlBaseVal,
      fechaCreacion: fechaCreacionVal,
      favorito: favoritoVal,
      localidades: localidadesParsed,
      imageUrl: imageVal,
      enlace: enlaceVal,
      enVenta,
      espectaculo: espectaculoVal,
      sitio: sitioVal,
    });
  }

  return eventos;
}

/**
 * Agrega un nuevo evento en Google Sheets.
 */
export async function addEventoToSheets(evento: Omit<Evento, 'rowId'>): Promise<Evento> {
  if (!isSheetsConfigured()) {
    throw new Error('Google Sheets no está configurado.');
  }

  const sheets = getSheetsInstance();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID!;

  await initializeSheet(sheets, spreadsheetId);

  const rowValues = [
    evento.id || '',
    evento.nombre,
    evento.fecha,
    evento.promoterId,
    evento.eventId,
    evento.showId,
    evento.urlBase,
    evento.fechaCreacion,
    evento.favorito ? 'SI' : 'NO',
    evento.localidades ? JSON.stringify(evento.localidades) : '[]',
    evento.imageUrl || '',
    evento.enlace || '',
    evento.enVenta ? 'A LA VENTA' : 'EN CONFIGURACION',
    evento.espectaculo || '',
    evento.sitio || '',
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: RANGE,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [rowValues],
    },
  });

  const eventos = await fetchEventosFromSheets();
  const creado = eventos.find((e) => e.id === evento.id || e.nombre === evento.nombre);
  return creado || { ...evento, rowId: (eventos.length + 1).toString() };
}

/**
 * Resuelve la fila física en Google Sheets dado un rowId o id de evento.
 */
async function resolveRowIndex(targetId: string, sheets: any, spreadsheetId: string): Promise<string> {
  // Si ya es un índice numérico pequeño (ej. "2", "3"), lo verificamos
  if (/^\d+$/.test(targetId) && parseInt(targetId, 10) < 500) {
    return targetId;
  }
  // Buscamos la fila coincidente en las columnas A hasta G
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAME}!A:G`,
    });
    const rows = res.data.values || [];
    const cleanTarget = targetId.trim().toLowerCase();

    for (let i = 1; i < rows.length; i++) {
      const colA = rows[i]?.[0]?.toString().trim().toLowerCase(); // ID
      const colB = rows[i]?.[1]?.toString().trim().toLowerCase(); // Nombre
      const colE = rows[i]?.[4]?.toString().trim().toLowerCase(); // Event ID
      const colF = rows[i]?.[5]?.toString().trim().toLowerCase(); // Show ID
      const colG = rows[i]?.[6]?.toString().trim().toLowerCase(); // URL base

      if (
        colA === cleanTarget ||
        (colF && cleanTarget.includes(colF)) ||
        (colE && cleanTarget.includes(colE)) ||
        (colG && (cleanTarget === colG || cleanTarget.includes(colG))) ||
        (colB && (cleanTarget === colB || cleanTarget.includes(colB)))
      ) {
        return (i + 1).toString();
      }
    }
  } catch (e) {
    console.error('Error resolviendo row index:', e);
  }
  return targetId;
}

/**
 * Actualiza el estado de Favorito en Google Sheets para un evento.
 */
export async function updateEventoFavoritoInSheets(idOrRowId: string, favorito: boolean): Promise<boolean> {
  if (!isSheetsConfigured()) {
    throw new Error('Google Sheets no está configurado.');
  }

  const sheets = getSheetsInstance();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID!;
  const rowId = await resolveRowIndex(idOrRowId, sheets, spreadsheetId);

  // Columna I es Favorito
  const cellRange = `${SHEET_NAME}!I${rowId}`;

  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: cellRange,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[favorito ? 'SI' : 'NO']],
      },
    });
    return true;
  } catch (error: any) {
    console.error('Error actualizando favorito en Sheets:', error.message);
    return false;
  }
}

/**
 * Elimina un evento de la hoja limpiando el rango de su fila.
 */
export async function deleteEventoInSheets(idOrRowId: string): Promise<boolean> {
  if (!isSheetsConfigured()) {
    throw new Error('Google Sheets no está configurado.');
  }

  const sheets = getSheetsInstance();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID!;
  const rowId = await resolveRowIndex(idOrRowId, sheets, spreadsheetId);

  const rowRange = `${SHEET_NAME}!A${rowId}:L${rowId}`;

  try {
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: rowRange,
    });
    return true;
  } catch (error: any) {
    console.error('Error eliminando evento en Sheets:', error.message);
    return false;
  }
}

/**
 * Guarda o actualiza las localidades de un evento en Google Sheets.
 */
export async function updateEventoLocalidadesInSheets(idOrRowId: string, localidades: Localidad[]): Promise<boolean> {
  if (!isSheetsConfigured()) {
    throw new Error('Google Sheets no está configurado.');
  }

  const sheets = getSheetsInstance();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID!;
  const rowId = await resolveRowIndex(idOrRowId, sheets, spreadsheetId);

  if (!/^\d+$/.test(rowId)) {
    // Si no se encontró la fila física directamente, intentar buscar por eventos completos
    const allEvents = await fetchEventosFromSheets();
    const match = allEvents.find(
      (e) => (e.id && e.id === idOrRowId) ||
             (e.showId && idOrRowId.includes(e.showId)) ||
             (e.nombre && idOrRowId.toLowerCase().includes(e.nombre.toLowerCase()))
    );
    if (match && match.rowId && /^\d+$/.test(match.rowId)) {
      return updateEventoLocalidadesInSheets(match.rowId, localidades);
    }
    console.error(`No se pudo resolver una fila válida para el evento '${idOrRowId}'`);
    return false;
  }

  // Columna J es Localidades
  const cellRange = `${SHEET_NAME}!J${rowId}`;

  // Deduplicar estrictamente por ID y por Nombre
  const seen = new Set<string>();
  const cleanLocalidades = localidades.filter((loc) => {
    const idKey = (loc.id || '').toUpperCase().trim();
    const nameKey = (loc.nombre || '').toUpperCase().trim();
    if (idKey && seen.has(idKey)) return false;
    if (nameKey && seen.has(nameKey)) return false;
    if (idKey) seen.add(idKey);
    if (nameKey) seen.add(nameKey);
    return true;
  });

  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: cellRange,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[JSON.stringify(cleanLocalidades)]],
      },
    });
    return true;
  } catch (error: any) {
    console.error('Error actualizando localidades en Sheets:', error.message);
    return false;
  }
}

/**
 * Actualiza las credenciales de URL base y IDs (columnas D a G) y localidades (columna J) de un evento.
 */
export async function updateEventoMetadataInSheets(
  idOrRowId: string,
  updates: {
    promoterId?: string;
    eventId?: string;
    showId?: string;
    urlBase?: string;
    localidades?: Localidad[];
  }
): Promise<boolean> {
  if (!isSheetsConfigured()) {
    throw new Error('Google Sheets no está configurado.');
  }

  const sheets = getSheetsInstance();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID!;
  const rowId = await resolveRowIndex(idOrRowId, sheets, spreadsheetId);

  if (!/^\d+$/.test(rowId)) {
    console.error(`No se pudo resolver una fila válida para el evento '${idOrRowId}'`);
    return false;
  }

  // Columnas D (Promoter ID), E (Event ID), F (Show ID), G (URL base)
  if (updates.promoterId || updates.eventId || updates.showId || updates.urlBase) {
    const dToGRange = `${SHEET_NAME}!D${rowId}:G${rowId}`;
    try {
      const currentRes = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: dToGRange,
      });
      const currentVals = currentRes.data.values?.[0] || [];

      let pId = updates.promoterId;
      let eId = updates.eventId;
      let sId = updates.showId;
      const uBase = updates.urlBase || currentVals[3] || '';

      if (uBase && (!pId || !eId || !sId)) {
        const match = uBase.match(/\/promoters\/([^/]+)\/events\/([^/]+)\/shows\/([^/?#]+)/);
        if (match) {
          if (!pId) pId = match[1];
          if (!eId) eId = match[2];
          if (!sId) sId = match[3];
        }
      }

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: dToGRange,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[
            pId ?? currentVals[0] ?? '',
            eId ?? currentVals[1] ?? '',
            sId ?? currentVals[2] ?? '',
            uBase,
          ]],
        },
      });
    } catch (e: any) {
      console.error('Error actualizando columnas D-G en Sheets:', e.message);
    }
  }

  // Columna J (Localidades)
  if (updates.localidades && updates.localidades.length > 0) {
    await updateEventoLocalidadesInSheets(rowId, updates.localidades);
  }

  return true;
}

export interface RawFirestoreEvent {
  id: string;
  titulo: string;
  enlace: string;
  imagen: string;
  fecha: string;
}

/**
 * Obtiene los eventos crudos desde el endpoint de caché de Firestore.
 */
export async function fetchFirestoreEventsRaw(): Promise<RawFirestoreEvent[]> {
  const res = await fetch(FIRESTORE_URL, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Error consultando Firestore: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  const rawValues = data?.fields?.eventos?.arrayValue?.values || [];

  return rawValues.map((v: any) => {
    const fields = v.mapValue?.fields || {};
    const resObj: any = {};
    for (const k in fields) {
      resObj[k] = Object.values(fields[k])[0];
    }
    return {
      id: resObj.id || '',
      titulo: resObj.titulo || '',
      enlace: resObj.enlace || '',
      imagen: resObj.imagen || '',
      fecha: resObj.fecha || '',
    };
  });
}

export interface SyncCheckResult {
  hasUpdates: boolean;
  newCount: number;
  updatedCount: number;
  totalRemote: number;
  newEvents: RawFirestoreEvent[];
  updatedEvents: Array<{ id: string; titulo: string; changes: string[] }>;
}

/**
 * Compara los eventos de la API de Firestore con los existentes en Google Sheets
 * e identifica si hay eventos nuevos o fechas/títulos modificados.
 */
export async function checkFirestoreUpdates(): Promise<SyncCheckResult> {
  const remoteEvents = await fetchFirestoreEventsRaw();
  const currentEvents = await fetchEventosFromSheets();

  const newEvents: RawFirestoreEvent[] = [];
  const updatedEvents: Array<{ id: string; titulo: string; changes: string[] }> = [];

  for (const remote of remoteEvents) {
    const cleanRemoteTitle = remote.titulo.replace(/[\n\r]+/g, ' - ').replace(/\s+/g, ' ').trim();
    const remoteIsoDate = parseSpanishDateToISO(remote.fecha);

    // Buscar si ya existe por ID o por coincidencia exacta de nombre
    const existing = currentEvents.find((e) => {
      if (e.id && remote.id && String(e.id).trim() === String(remote.id).trim()) return true;
      if (e.id && remote.id && String(e.id).trim() !== String(remote.id).trim()) return false;
      const cleanExisting = e.nombre.replace(/[\n\r]+/g, ' ').trim().toUpperCase();
      const cleanRemUpper = cleanRemoteTitle.replace(/[\n\r]+/g, ' ').trim().toUpperCase();
      return cleanExisting === cleanRemUpper;
    });

    if (!existing) {
      newEvents.push(remote);
    } else {
      const changes: string[] = [];
      if (existing.fecha !== remoteIsoDate) {
        changes.push(`Fecha: ${existing.fecha} -> ${remoteIsoDate}`);
      }
      if (existing.imageUrl !== remote.imagen && remote.imagen) {
        changes.push('Imagen actualizada');
      }
      if (existing.enlace !== remote.enlace && remote.enlace) {
        changes.push('Enlace actualizado');
      }
      if (changes.length > 0) {
        updatedEvents.push({ id: remote.id, titulo: cleanRemoteTitle, changes });
      }
    }
  }

  return {
    hasUpdates: newEvents.length > 0 || updatedEvents.length > 0,
    newCount: newEvents.length,
    updatedCount: updatedEvents.length,
    totalRemote: remoteEvents.length,
    newEvents,
    updatedEvents,
  };
}

/**
 * Sincroniza los eventos de Firestore hacia Google Sheets.
 * Conserva los datos de configuración (Promoter ID, Event ID, Show ID, Localidades)
 * de los eventos existentes que coincidan.
 */
export async function syncEventsFromFirestore(): Promise<{
  success: boolean;
  totalSynced: number;
  addedCount: number;
  updatedCount: number;
  events: Evento[];
}> {
  if (!isSheetsConfigured()) {
    throw new Error('Google Sheets no está configurado.');
  }

  const sheets = getSheetsInstance();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID!;

  // 1. Obtener eventos de Firestore
  const remoteEvents = await fetchFirestoreEventsRaw();

  // 2. Obtener eventos actuales de Google Sheets para preservar configuraciones
  let currentEvents: Evento[] = [];
  try {
    currentEvents = await fetchEventosFromSheets();
  } catch (e) {
    console.warn('No se pudieron leer eventos actuales, se creará hoja limpia:', e);
  }

  let addedCount = 0;
  let updatedCount = 0;
  const todayIso = new Date().toISOString().split('T')[0];

  // 3. Mapear los eventos de Firestore combinando con datos existentes
  const finalRows: any[][] = [];
  const matchedExistingKeys = new Set<string>();
  const seenIds = new Set<string>();

  for (const remote of remoteEvents) {
    if (remote.id && seenIds.has(remote.id)) continue;
    if (remote.id) seenIds.add(remote.id);

    const cleanTitle = remote.titulo.replace(/[\n\r]+/g, ' - ').replace(/\s+/g, ' ').trim();
    const isoDate = parseSpanishDateToISO(remote.fecha);

    // Buscar coincidencia en los existentes por ID oficial o por nombre exacto
    const existing = currentEvents.find((e) => {
      if (e.id && remote.id && String(e.id).trim() === String(remote.id).trim()) return true;
      if (e.id && remote.id && String(e.id).trim() !== String(remote.id).trim()) return false;
      const cleanExisting = e.nombre.replace(/[\n\r]+/g, ' ').trim().toUpperCase();
      const cleanUpper = cleanTitle.replace(/[\n\r]+/g, ' ').trim().toUpperCase();
      return cleanExisting === cleanUpper;
    });

    if (existing) {
      updatedCount++;
      matchedExistingKeys.add(existing.id || existing.rowId || existing.nombre);
    } else {
      addedCount++;
    }

    const row = [
      remote.id, // Columna A: ID oficial QRBoletos
      cleanTitle, // Columna B: Nombre del evento
      isoDate, // Columna C: Fecha normalizada YYYY-MM-DD
      existing?.promoterId || '', // Columna D: Promoter ID preservado
      existing?.eventId || '', // Columna E: Event ID preservado
      existing?.showId || '', // Columna F: Show ID preservado
      existing?.urlBase || '', // Columna G: URL base preservada
      existing?.fechaCreacion || todayIso, // Columna H: Fecha de creación
      existing?.favorito ? 'SI' : 'NO', // Columna I: Favorito
      existing?.localidades ? JSON.stringify(existing.localidades) : '[]', // Columna J: Localidades JSON
      remote.imagen || existing?.imageUrl || '', // Columna K: Imagen
      remote.enlace || existing?.enlace || '', // Columna L: Enlace público
      'A LA VENTA', // Columna M: Estado Venta
      existing?.espectaculo || '', // Columna N: Espectáculo
      existing?.sitio || '', // Columna O: Sitio
    ];

    finalRows.push(row);
  }

  // 3.1. PRESERVAR EVENTOS NO LISTADOS A VENTA:
  // Conservar todos los eventos locales, manuales o detectados en Chrome que NO están en la API pública de Firestore
  for (const existing of currentEvents) {
    const key = existing.id || existing.rowId || existing.nombre;
    if (existing.id && seenIds.has(existing.id)) continue;
    if (!matchedExistingKeys.has(key)) {
      if (existing.id) seenIds.add(existing.id);
      const nonRemoteRow = [
        existing.id || '',
        existing.nombre,
        existing.fecha || '',
        existing.promoterId || '',
        existing.eventId || '',
        existing.showId || '',
        existing.urlBase || '',
        existing.fechaCreacion || todayIso,
        existing.favorito ? 'SI' : 'NO',
        existing.localidades ? JSON.stringify(existing.localidades) : '[]',
        existing.imageUrl || '',
        existing.enlace || '',
        existing.enVenta ? 'A LA VENTA' : 'EN CONFIGURACION',
        existing.espectaculo || '',
        existing.sitio || '',
      ];
      finalRows.push(nonRemoteRow);
    }
  }

  // 4. Limpiar toda la pestaña Eventos y escribir encabezados + filas
  try {
    // Limpiar hasta la columna Z y fila 200 para no dejar basura previa
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `${SHEET_NAME}!A1:Z200`,
    });
  } catch (clearErr) {
    console.warn('Error limpiando rango:', clearErr);
  }

  // Escribir encabezados + nuevas filas
  const allValues = [SHEET_HEADERS, ...finalRows];
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_NAME}!A1:O${allValues.length}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: allValues,
    },
  });

  // 5. Consultar los eventos frescos ya estructurados
  const freshEvents = await fetchEventosFromSheets();

  return {
    success: true,
    totalSynced: freshEvents.length,
    addedCount,
    updatedCount,
    events: freshEvents,
  };
}

// ============================================================================
// GESTIÓN DINÁMICA DEL TÚNEL LOCAL EN GOOGLE SHEETS (OPCIÓN A)
// ============================================================================

export interface TunnelConfig {
  url: string;
  updatedAt: string;
}

let cachedTunnelConfig: { data: TunnelConfig; expiry: number } | null = null;

/**
 * Consulta la URL activa del túnel guardada en la hoja "Config".
 */
export async function getTunnelConfigFromSheets(forceRefresh = false): Promise<TunnelConfig> {
  const now = Date.now();
  if (!forceRefresh && cachedTunnelConfig && cachedTunnelConfig.expiry > now) {
    return cachedTunnelConfig.data;
  }

  if (!isSheetsConfigured()) {
    return { url: process.env.LOCAL_BACKEND_URL || '', updatedAt: '' };
  }

  const sheets = getSheetsInstance();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID!;

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Config!A2:C2',
    });

    const row = res.data.values?.[0] || [];
    const url = (row[1] || '').trim();
    const updatedAt = row[2] || '';

    const config = { url, updatedAt };
    cachedTunnelConfig = { data: config, expiry: now + 15000 }; // 15 segundos de caché
    return config;
  } catch (err: any) {
    // Si la hoja Config aún no existe, intentamos crearla
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: { title: 'Config' },
              },
            },
          ],
        },
      });

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Config!A1:C1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [['Clave', 'Valor', 'ActualizadoEl']],
        },
      });
    } catch {
      // Ignorar si ya existía
    }

    return { url: process.env.LOCAL_BACKEND_URL || '', updatedAt: '' };
  }
}

/**
 * Guarda la nueva URL del túnel y la fecha actual en la hoja "Config".
 */
export async function saveTunnelConfigToSheets(tunnelUrl: string): Promise<TunnelConfig> {
  if (!isSheetsConfigured()) {
    throw new Error('Google Sheets no está configurado en las variables de entorno.');
  }

  const sheets = getSheetsInstance();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID!;
  const updatedAt = new Date().toISOString();

  // Asegurar que la pestaña Config existe
  try {
    await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Config!A1:C1',
    });
  } catch {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: { title: 'Config' },
              },
            },
          ],
        },
      });
    } catch {
      // Puede que ya existiera
    }
  }

  // Escribir fila 1 (encabezados) y fila 2 (TUNNEL_URL)
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Config!A1:C2',
    valueInputOption: 'RAW',
    requestBody: {
      values: [
        ['Clave', 'Valor', 'ActualizadoEl'],
        ['TUNNEL_URL', tunnelUrl.trim(), updatedAt],
      ],
    },
  });

  const config = { url: tunnelUrl.trim(), updatedAt };
  cachedTunnelConfig = { data: config, expiry: Date.now() + 15000 };
  return config;
}

