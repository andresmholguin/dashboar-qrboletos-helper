import { NextResponse } from 'next/server';
import { TarifarioExtracted, LocalidadPreciosConfig, PrecioItemConfig } from '@/types';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { imageBase64, mimeType: providedMime, apiKey: clientApiKey, eventLocalities } = body;

    if (!imageBase64) {
      return NextResponse.json(
        { success: false, error: 'Se requiere el archivo en base64 (imageBase64).' },
        { status: 400 }
      );
    }

    let mimeType = providedMime || 'image/png';
    const mimeMatch = imageBase64.match(/^data:([a-zA-Z0-9.-]+\/[a-zA-Z0-9.-]+);base64,/);
    if (mimeMatch) {
      mimeType = mimeMatch[1];
    }

    const apiKey = clientApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'No se configuró GEMINI_API_KEY en las variables de entorno ni se proporcionó en la solicitud.',
          needsApiKey: true,
        },
        { status: 400 }
      );
    }

    // Normalizar localidades del evento si fueron proporcionadas
    const rawEventLocalities: any[] = Array.isArray(eventLocalities) ? eventLocalities : [];
    const actualLocEntries = rawEventLocalities.map((l: any) => {
      if (typeof l === 'string') {
        return { nombre: l.trim(), id: undefined };
      }
      return {
        nombre: (l?.nombre || '').trim(),
        id: l?.id || undefined,
      };
    }).filter(e => e.nombre.length > 0);
    const actualLocNames = actualLocEntries.map(e => e.nombre);

    // Limpiar el prefijo data:...;base64, (soporta PDF e imágenes)
    const cleanBase64 = imageBase64.replace(/^data:[a-zA-Z0-9.-]+\/[a-zA-Z0-9.-]+;base64,/, '');

    const systemPrompt = `
Eres un asistente experto en extracción de datos de boletería y taquilla de eventos.
Analiza el documento (PDF o imagen) del Comité de Precios o tarifario y extrae con máxima precisión la información de precios y localidades.
${actualLocNames.length > 0 ? `\nLOCALIDADES CONFIGURADAS EN EL EVENTO:\n${actualLocNames.map(n => `- ${n}`).join('\n')}\n` : ''}

REGLAS DE NEGOCIO OBLIGATORIAS:
1. NOMBRES DE LAS ETAPAS:
   - Mantén los nombres de las etapas exactamente como aparecen en la columna DESCRIPCION / ETAPA (ejemplo: "Preventa", "Full", "Lanzamiento").
2. FORMATEO DE MONEDA:
   - Limpia separadores de miles (ejemplo: "60.000" debe ser 60000, "9.000" debe ser 9000). Los campos valor y servicio deben ser enteros.
3. FILAS VACÍAS O INACTIVAS:
   - Si una etapa (como LANZAMIENTO) tiene guiones "-", valor vacío o no tiene precio asignado, NO la agregues.
4. REGLA DE AFORO PARA SILLETERÍA NUMERADA:
   - En la última etapa ("FULL"), el aforo DEBE SER OBLIGATORIAMENTE 0 (0 representa cupo restante de sillas disponibles).
   - En etapas previas ("PREVENTA", "LANZAMIENTO"), el aforo es el cupo de control indicado en la columna DISTRIBUCION o AFORO (ejemplo: 200, 134, 170).
5. NOMENCLATURA DE REFERENCIA:
   - Formato obligatorio: "{LOCALIDAD} {ABREVIATURA_ETAPA}".
   - Abreviaturas estándar de etapa:
     * PREVENTA -> "PRE"
     * FULL -> "FULL"
     * LANZAMIENTO -> "LANZ"
     * EARLY BIRD -> "EB"
   - Para las localidades de Preferencial NO usar abreviaturas como PREF, poner el nombre completo: "PREFERENCIAL 1 PRE", "PREFERENCIAL 1 FULL", "PREFERENCIAL 2 PRE", etc.
   - Ejemplos: "PLATEA PRE", "PLATEA FULL", "VIP 1 PRE", "VIP 1 FULL", "VIP 2 PRE", "PREFERENCIAL 1 PRE", "PREFERENCIAL 1 FULL", "PREFERENCIAL 2 PRE".
6. REGLA DE LOCALIDADES GLOBALES VS INDIVIDUALES:
   - Si el documento contiene un único precio para "VIP" o "PREFERENCIAL" de forma general, extráelo tal cual con ese nombre (ej. "VIP", "PREFERENCIAL"). El sistema se encarga de replicarlo y dividir el aforo.
   - Si el documento desglosa por grupos específicos (ej. "VIP 1 Y 5", "VIP 2, 3 Y 4"), mantén esos nombres de grupo tal cual aparecen.

Estructura de salida JSON estrictamente esperada:
{
  "eventoNombre": string,
  "fecha": string,
  "lugar": string,
  "localidades": [
    {
      "nombre": string, // ej. "PLATEA", "VIP 1 Y 5", "VIP 2, 3 Y 4", etc.
      "aforoTotal": number,
      "precios": [
        {
          "referencia": string,
          "etapa": string, // ej. "Preventa", "Full"
          "moneda": "COP",
          "valor": number,
          "servicio": number,
          "aforo": number
        }
      ]
    }
  ],
  "advertencias": [string]
}
`;

    // Lista de modelos compatibles con visión y PDF en orden de prioridad
    const CANDIDATE_MODELS = [
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-flash-latest',
    ];

    const isOAuth = apiKey.startsWith('ya29.');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (isOAuth) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    } else {
      headers['x-goog-api-key'] = apiKey;
    }

    const geminiPayload = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: systemPrompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: cleanBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        response_mime_type: 'application/json',
        temperature: 0.1,
      },
    };

    let rawContent: string | null = null;
    let lastError: string = '';

    for (const modelName of CANDIDATE_MODELS) {
      try {
        const geminiUrl = isOAuth
          ? `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`
          : `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
        const response = await fetch(geminiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(geminiPayload),
        });

        if (response.ok) {
          const data = await response.json();
          rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawContent) {
            console.log(`[Pricing Extract] Éxito con modelo: ${modelName}`);
            break;
          }
        } else {
          lastError = await response.text();
          console.warn(`[Pricing Extract] Modelo ${modelName} falló (${response.status}): ${lastError.slice(0, 150)}`);
        }
      } catch (callErr: any) {
        lastError = callErr.message || String(callErr);
        console.warn(`[Pricing Extract] Excepción llamando a ${modelName}:`, lastError);
      }
    }

    if (!rawContent) {
      return NextResponse.json(
        {
          success: false,
          error: `No se pudo procesar el documento con los modelos de IA disponibles: ${lastError}`,
        },
        { status: 500 }
      );
    }

    let parsed: TarifarioExtracted;
    try {
      let jsonStr = rawContent.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      parsed = JSON.parse(jsonStr);
    } catch (parseErr: any) {
      console.error('Error parseando JSON de Gemini:', rawContent);
      return NextResponse.json(
        { success: false, error: 'El modelo no devolvió un formato JSON válido.', rawText: rawContent },
        { status: 500 }
      );
    }

    // APLICAR REGLAS DE NEGOCIO Y DESGLOSE INDEPENDIENTE DE LOCALIDADES
    const expandedLocalidades: LocalidadPreciosConfig[] = [];

    // Identificar localidades VIP en el evento
    const detectedVipEntries = actualLocEntries.filter(e => /\bVIP\b/i.test(e.nombre));
    detectedVipEntries.sort((a, b) => {
      const numA = parseInt((a.nombre.match(/\d+/) || ['0'])[0], 10);
      const numB = parseInt((b.nombre.match(/\d+/) || ['0'])[0], 10);
      return numA - numB;
    });

    // Identificar localidades Preferencial en el evento
    const detectedPrefEntries = actualLocEntries.filter(e => /\bPREF(?:ERENCIAL)?\b/i.test(e.nombre));
    detectedPrefEntries.sort((a, b) => {
      const numA = parseInt((a.nombre.match(/\d+/) || ['0'])[0], 10);
      const numB = parseInt((b.nombre.match(/\d+/) || ['0'])[0], 10);
      return numA - numB;
    });

    // Fallbacks si no se pasaron localidades del evento o no tenían numeradas:
    const effectiveVipEntries = detectedVipEntries.length > 0
      ? detectedVipEntries
      : [1, 2, 3, 4, 5].map(n => ({ nombre: `VIP ${n}`, id: undefined }));

    const effectivePrefEntries = detectedPrefEntries.length > 0
      ? detectedPrefEntries
      : [1, 2, 3, 4, 5].map(n => ({ nombre: `PREFERENCIAL ${n}`, id: undefined }));

    if (parsed.localidades && Array.isArray(parsed.localidades)) {
      const rawLocList = parsed.localidades;

      // Contar cuántas entradas corresponden a VIP y a PREFERENCIAL en el documento extraído
      const tarifarioVipEntries = rawLocList.filter(l => /\bVIP\b/i.test(l.nombre || ''));
      const tarifarioPrefEntries = rawLocList.filter(l => /\bPREF(?:ERENCIAL)?\b/i.test(l.nombre || ''));

      // ¿Se especificó solo 1 fila/sección global para VIP?
      const isSingleVipInTarifario = tarifarioVipEntries.length === 1;

      // ¿Se especificó solo 1 fila/sección global para Preferencial?
      const isSinglePrefInTarifario = tarifarioPrefEntries.length === 1;

      for (const rawLoc of rawLocList) {
        const rawName = (rawLoc.nombre || '').toUpperCase().trim();
        const basePrecios = rawLoc.precios || [];

        let targetItems: { nombre: string; id?: string }[] = [];
        let prioritizeTarget: string | null = null; // Quien recibe el remanente mayor si aplica

        // CASO 1: Subgrupos explícitos en el documento (ej. "VIP 1 Y 5", "VIP 2, 3 Y 4", etc.)
        if (/VIP\s*1\s*(?:Y|,|&)\s*5/i.test(rawName)) {
          targetItems = effectiveVipEntries.filter(v => /\b1\b/.test(v.nombre) || /\b5\b/.test(v.nombre));
          if (targetItems.length === 0) {
            targetItems = [{ nombre: 'VIP 1' }, { nombre: 'VIP 5' }];
          }
        } else if (/VIP\s*2\s*[,Y]\s*3\s*[,Y]\s*4/i.test(rawName) || rawName.includes('VIP 2, 3 Y 4') || rawName.includes('VIP 2,3 Y 4')) {
          targetItems = effectiveVipEntries.filter(v => /\b2\b/.test(v.nombre) || /\b3\b/.test(v.nombre) || /\b4\b/.test(v.nombre));
          if (targetItems.length === 0) {
            targetItems = [{ nombre: 'VIP 2' }, { nombre: 'VIP 3' }, { nombre: 'VIP 4' }];
          }
          prioritizeTarget = 'VIP 2'; // Distribución preferente para VIP 2
        } else if (/PREF(?:ERENCIAL)?\s*1\s*(?:Y|,|&)\s*5/i.test(rawName)) {
          targetItems = effectivePrefEntries.filter(p => /\b1\b/.test(p.nombre) || /\b5\b/.test(p.nombre));
          if (targetItems.length === 0) {
            targetItems = [{ nombre: 'PREFERENCIAL 1' }, { nombre: 'PREFERENCIAL 5' }];
          }
        } else if (/PREF(?:ERENCIAL)?\s*2\s*[,Y]\s*3\s*[,Y]\s*4/i.test(rawName) || rawName.includes('PREF 2, 3 Y 4') || rawName.includes('PREF 2,3 Y 4')) {
          targetItems = effectivePrefEntries.filter(p => /\b2\b/.test(p.nombre) || /\b3\b/.test(p.nombre) || /\b4\b/.test(p.nombre));
          if (targetItems.length === 0) {
            targetItems = [{ nombre: 'PREFERENCIAL 2' }, { nombre: 'PREFERENCIAL 3' }, { nombre: 'PREFERENCIAL 4' }];
          }
          prioritizeTarget = 'PREFERENCIAL 2';
        }
        // CASO 2: Localidad numerada individual específica (ej. "VIP 1", "VIP 4", "PREFERENCIAL 3")
        else if (/^VIP\s*\d+$/i.test(rawName)) {
          const found = effectiveVipEntries.find(v => v.nombre.toUpperCase() === rawName);
          targetItems = [found || { nombre: rawName }];
        } else if (/^PREF(?:ERENCIAL)?\s*\d+$/i.test(rawName)) {
          const num = rawName.match(/\d+/)?.[0];
          const found = effectivePrefEntries.find(p => num && p.nombre.includes(num));
          targetItems = [found || { nombre: rawName }];
        }
        // CASO 3: REGLA DE NEGOCIO PRINCIPAL:
        // Si hay múltiples VIP en el recinto y solo se monta 1 precio de VIP, va para TODAS y el aforo se divide
        else if (/\bVIP\b/i.test(rawName) && isSingleVipInTarifario && effectiveVipEntries.length > 1) {
          targetItems = [...effectiveVipEntries];
        }
        // CASO 4: Si hay múltiples PREFERENCIAL en el recinto y solo se monta 1 precio de PREFERENCIAL, va para TODAS y el aforo se divide
        else if (/\bPREF(?:ERENCIAL)?\b/i.test(rawName) && isSinglePrefInTarifario && effectivePrefEntries.length > 1) {
          targetItems = [...effectivePrefEntries];
        }
        // CASO 5: Cualquier otra localidad (ej. "PLATEA", "GENERAL", etc.)
        else {
          const found = actualLocEntries.find(e => e.nombre.toUpperCase() === rawName);
          targetItems = [found || { nombre: rawName }];
        }

        const count = targetItems.length;

        for (const item of targetItems) {
          const locName = item.nombre;
          const seccionId = item.id;
          const newPrecios: PrecioItemConfig[] = [];
          let ultimaEtapaNombre = 'Full';

          for (const p of basePrecios) {
            const etapaRaw = p.etapa || 'General';
            const isFull = etapaRaw.toLowerCase().includes('full') || (p.referencia || '').toUpperCase().includes('FULL');
            if (isFull) {
              ultimaEtapaNombre = etapaRaw;
            }

            // Calcular aforo para esta localidad individual
            let individualAforo = 0;
            if (isFull) {
              individualAforo = 0; // REGLA: en FULL el aforo siempre es 0
            } else if (count === 1) {
              individualAforo = p.aforo || 0;
            } else {
              // División de aforo equitativa entre localidades independientes
              const totalAforo = p.aforo || 0;
              const base = Math.floor(totalAforo / count);
              const remainder = totalAforo % count;
              const locIndex = targetItems.indexOf(item);

              if (prioritizeTarget && locName.toUpperCase().includes(prioritizeTarget.toUpperCase())) {
                individualAforo = base + remainder; // Recibe el valor máximo / remanente
              } else if (!prioritizeTarget && remainder > 0 && locIndex < remainder) {
                individualAforo = base + 1; // Distribución equitativa del remanente a las primeras localidades
              } else {
                individualAforo = base;
              }
            }

            // Generar la referencia con formato "{LOCALIDAD} {ABREV}"
            let abrev = 'PRE';
            if (isFull) abrev = 'FULL';
            else if (etapaRaw.toLowerCase().includes('lanz')) abrev = 'LANZ';
            else if (etapaRaw.toLowerCase().includes('early')) abrev = 'EB';

            // REGLA: Para localidades de Preferencial NO usar abreviaturas, poner el nombre completo:
            // "PREFERENCIAL 1 PRE", "PREFERENCIAL 1 FULL", "PREFERENCIAL 2 PRE", etc.
            let refPrefix = locName.toUpperCase().trim();
            refPrefix = refPrefix.replace(/\bPREF\b/g, 'PREFERENCIAL');
            const referenciaGenerada = `${refPrefix} ${abrev}`;

            newPrecios.push({
              referencia: referenciaGenerada,
              etapa: etapaRaw,
              moneda: p.moneda || 'COP',
              valor: p.valor || 0,
              servicio: p.servicio || 0,
              aforo: individualAforo,
              habilitadoOnline: true,
              habilitadoTaquilla: true,
            });
          }

          // REGLA: Generar precio adicional "CORTESIAS" para cada localidad
          newPrecios.push({
            referencia: 'CORTESIAS',
            etapa: ultimaEtapaNombre,
            moneda: 'COP',
            valor: 0,
            servicio: 0,
            aforo: 0,
            habilitadoOnline: false, // Sólo se verá en los puntos físicos, NO para venta en línea
            habilitadoTaquilla: true, // Habilitado para puntos físicos
          });

          expandedLocalidades.push({
            nombre: locName,
            seccionId: seccionId,
            aforoTotal: rawLoc.aforoTotal ? Math.floor(rawLoc.aforoTotal / count) : undefined,
            precios: newPrecios,
          });
        }
      }
    }

    parsed.localidades = expandedLocalidades;

    return NextResponse.json({
      success: true,
      data: parsed,
    });
  } catch (err: any) {
    console.error('Error en /api/pricing/extract:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Error interno en el servidor.' },
      { status: 500 }
    );
  }
}
