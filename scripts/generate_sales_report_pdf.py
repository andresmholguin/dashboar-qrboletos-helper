import sys
import os
import json
import argparse
import datetime
from playwright.sync_api import sync_playwright

def format_cop(val):
    try:
        n = int(val)
        return f"${n:,.0f}".replace(",", ".")
    except:
        return "$0"

def format_num(val):
    try:
        return f"{int(val):,}".replace(",", ".")
    except:
        return "0"

def clean_currency(val_str):
    if not val_str:
        return 0
    tokens = str(val_str).replace("$", "").split("COP")
    target = tokens[-1].strip() if tokens else str(val_str)
    cleaned = target.replace(".", "").replace(",", "").strip()
    digits = "".join(ch for ch in cleaned if ch.isdigit() or ch == '-')
    if not digits:
        return 0
    try:
        return int(digits)
    except:
        return 0

def clean_int(val_str):
    if not val_str:
        return 0
    lines = [l.strip() for l in str(val_str).split("\n") if l.strip()]
    target = lines[-1] if lines else str(val_str)
    digits = "".join(ch for ch in target if ch.isdigit() or ch == '-')
    if not digits:
        return 0
    try:
        return int(digits)
    except:
        return 0

def build_css(layout):
    """Retorna los estilos CSS específicos según el diseño seleccionado."""
    if layout == "compact_landscape":
        return """
        @page {
            size: letter landscape;
            margin: 8mm 10mm 8mm 10mm;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            color: #1e293b;
            background: #fff;
            margin: 0;
            padding: 0;
            font-size: 9.5px;
            line-height: 1.25;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 5px;
            margin-bottom: 8px;
        }
        .brand-title { font-size: 15px; font-weight: 800; color: #0f172a; }
        .brand-subtitle { font-size: 10px; color: #64748b; }
        .header-meta { font-size: 9px; color: #475569; text-align: right; }
        
        /* Barra de KPIs en una sola línea horizontal ultra-compacta */
        .ticker-bar {
            background: #0f172a;
            color: #fff;
            border-radius: 5px;
            padding: 5px 10px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
            font-size: 9.5px;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        }
        .ticker-item { display: flex; gap: 4px; align-items: center; }
        .ticker-label { color: #94a3b8; text-transform: uppercase; font-size: 8px; font-weight: 700; }
        .ticker-val { font-weight: 800; color: #fff; }
        .ticker-val.highlight { color: #34d399; }
        .ticker-val.service { color: #c084fc; }
        .ticker-val.cortesia { color: #f87171; }

        .event-section {
            margin-bottom: 10px;
            page-break-inside: avoid;
        }
        .event-bar {
            background: #1e293b;
            color: #fff;
            padding: 4px 8px;
            border-radius: 4px 4px 0 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 10.5px;
            font-weight: 700;
        }
        .event-bar .details { font-size: 8.5px; color: #cbd5e1; display: flex; gap: 10px; }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 9px;
            border: 1px solid #cbd5e1;
            border-top: none;
        }
        th {
            background: #334155;
            color: #f8fafc;
            padding: 3.5px 6px;
            text-align: left;
            font-weight: 700;
            font-size: 8.5px;
            text-transform: uppercase;
        }
        td {
            padding: 3px 6px;
            border-bottom: 1px solid #e2e8f0;
            color: #334155;
        }
        tr:nth-child(even) td { background: #f8fafc; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
        .row-total td {
            background: #e2e8f0 !important;
            font-weight: 800;
            color: #0f172a;
            border-top: 1px solid #0f172a;
            border-bottom: 1.5px solid #0f172a;
        }
        .tag-web { background: #eff6ff; color: #1d4ed8; padding: 1px 4px; border-radius: 2px; font-weight: 700; font-size: 8px; }
        .tag-pos { background: #ecfdf5; color: #047857; padding: 1px 4px; border-radius: 2px; font-weight: 700; font-size: 8px; }
        .tag-cortesia { background: #fef2f2; color: #b91c1c; padding: 1px 4px; border-radius: 2px; font-weight: 700; font-size: 8px; border: 1px solid #fca5a5; }
        .footer {
            margin-top: 10px;
            border-top: 1px solid #e2e8f0;
            padding-top: 4px;
            display: flex;
            justify-content: space-between;
            font-size: 8px;
            color: #94a3b8;
        }
        """
    elif layout == "onepage_portrait":
        return """
        @page {
            size: letter portrait;
            margin: 10mm 12mm 10mm 12mm;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            color: #1e293b;
            background: #fff;
            margin: 0;
            padding: 0;
            font-size: 10.5px;
            line-height: 1.35;
        }
        .page-event {
            page-break-after: always;
            display: flex;
            flex-direction: column;
            min-height: 94vh;
            justify-content: space-between;
        }
        .page-event:last-child {
            page-break-after: auto;
        }
        .formal-header {
            border-bottom: 2px solid #0f172a;
            padding-bottom: 8px;
            margin-bottom: 10px;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
        }
        .formal-title { font-size: 16px; font-weight: 800; color: #0f172a; text-transform: uppercase; }
        .formal-subtitle { font-size: 11px; color: #64748b; font-weight: 600; }
        .formal-meta { text-align: right; font-size: 9.5px; color: #475569; }

        .event-card-box {
            background: #f8fafc;
            border: 1.5px solid #0f172a;
            border-radius: 6px;
            padding: 10px 14px;
            margin-bottom: 12px;
        }
        .event-card-title { font-size: 14px; font-weight: 800; color: #0f172a; margin-bottom: 4px; }
        .event-card-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 6px;
            font-size: 10px;
            color: #475569;
        }
        .event-card-grid strong { color: #0f172a; }

        /* Matriz de 3x2 tarjetas KPI */
        .kpi-matrix {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
            margin-bottom: 12px;
        }
        .kpi-box {
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            padding: 8px 10px;
            background: #fff;
        }
        .kpi-box.highlight { background: #f0fdf4; border-color: #86efac; }
        .kpi-box.cortesia { background: #fef2f2; border-color: #fca5a5; }
        .kpi-box-label { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 2px; }
        .kpi-box-value { font-size: 15px; font-weight: 800; color: #0f172a; font-family: ui-monospace, monospace; }

        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 9.5px;
            border: 1px solid #cbd5e1;
            margin-bottom: 14px;
        }
        th {
            background: #0f172a;
            color: #fff;
            padding: 6px 8px;
            text-align: left;
            font-weight: 700;
            font-size: 9px;
            text-transform: uppercase;
        }
        td {
            padding: 5px 8px;
            border-bottom: 1px solid #e2e8f0;
            color: #334155;
        }
        tr:nth-child(even) td { background: #f8fafc; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
        .row-total td {
            background: #e2e8f0 !important;
            font-weight: 800;
            color: #0f172a;
            border-top: 2px solid #0f172a;
            border-bottom: 2px solid #0f172a;
        }

        /* Área de firmas de liquidación */
        .signatures-section {
            border-top: 1.5px dashed #94a3b8;
            padding-top: 16px;
            margin-top: auto;
        }
        .signatures-title {
            font-size: 9.5px;
            font-weight: 700;
            text-transform: uppercase;
            color: #64748b;
            margin-bottom: 25px;
            text-align: center;
        }
        .signatures-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 40px;
        }
        .sig-box {
            border-top: 1px solid #0f172a;
            padding-top: 4px;
            text-align: center;
            font-size: 9.5px;
        }
        .sig-name { font-weight: 700; color: #0f172a; }
        .sig-role { font-size: 8.5px; color: #64748b; }

        .footer {
            margin-top: 10px;
            display: flex;
            justify-content: space-between;
            font-size: 8.5px;
            color: #94a3b8;
        }
        """
    else:
        # standard_portrait (La actual adaptada a vertical)
        return """
        @page {
            size: letter portrait;
            margin: 10mm 12mm 10mm 12mm;
        }
        * { box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #1e293b;
            background-color: #ffffff;
            margin: 0;
            padding: 0;
            font-size: 10px;
            line-height: 1.35;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 8px;
            margin-bottom: 10px;
        }
        .brand-title { font-size: 16px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; }
        .brand-subtitle { font-size: 10.5px; color: #64748b; font-weight: 500; }
        .header-meta { text-align: right; font-size: 9px; color: #475569; }
        .header-meta strong { color: #0f172a; }
        .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 700; text-transform: uppercase; margin-left: 4px; }
        .badge-primary { background: #0284c7; color: white; }

        .kpi-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 6px;
            margin-bottom: 12px;
            page-break-inside: avoid;
        }
        .kpi-card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 6px 8px;
            page-break-inside: avoid;
        }
        .kpi-label { font-size: 8.5px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 2px; }
        .kpi-value { font-size: 13px; font-weight: 800; color: #0f172a; font-family: ui-monospace, monospace; }
        .kpi-highlight { color: #059669; }

        .event-section { margin-bottom: 14px; page-break-inside: avoid; }
        .event-header {
            background: #0f172a;
            color: white;
            padding: 6px 10px;
            border-radius: 5px 5px 0 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .event-title { font-size: 11.5px; font-weight: 700; }
        .event-details { font-size: 9px; color: #cbd5e1; display: flex; gap: 8px; }

        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 9px;
            border: 1px solid #cbd5e1;
            border-top: none;
        }
        th {
            background: #1e293b;
            color: #f8fafc;
            padding: 5px 6px;
            text-align: left;
            font-weight: 700;
            font-size: 8.5px;
            text-transform: uppercase;
        }
        td {
            padding: 4px 6px;
            border-bottom: 1px solid #e2e8f0;
            color: #334155;
        }
        tr:nth-child(even) td { background: #f8fafc; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .font-mono { font-family: ui-monospace, monospace; }
        .row-total td {
            background: #e2e8f0 !important;
            font-weight: 800;
            color: #0f172a;
            border-top: 1.5px solid #0f172a;
            border-bottom: 1.5px solid #0f172a;
        }
        .tag-web { background: #eff6ff; color: #1d4ed8; padding: 1px 4px; border-radius: 2px; font-weight: 700; font-size: 8px; }
        .tag-pos { background: #ecfdf5; color: #047857; padding: 1px 4px; border-radius: 2px; font-weight: 700; font-size: 8px; }
        .tag-cortesia { background: #fef2f2; color: #b91c1c; padding: 1px 4px; border-radius: 2px; font-weight: 700; font-size: 8px; border: 1px solid #fca5a5; }

        .grand-total-banner {
            background: #0f172a;
            color: white;
            padding: 8px 12px;
            border-radius: 5px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 12px;
            page-break-inside: avoid;
        }
        .grand-total-title { font-size: 11px; font-weight: 800; text-transform: uppercase; }
        .grand-total-figures {
            display: flex;
            gap: 12px;
            font-family: ui-monospace, monospace;
            font-size: 11px;
            font-weight: 700;
        }
        .footer {
            margin-top: 12px;
            border-top: 1px solid #e2e8f0;
            padding-top: 5px;
            display: flex;
            justify-content: space-between;
            font-size: 8px;
            color: #94a3b8;
        }
        """

def generate_pdf_report(sales_data, output_pdf, mode="general", report_type="general", target_url=None, layout="standard_portrait"):
    """Genera un archivo PDF profesional según el layout seleccionado."""
    if target_url:
        filtered = [ev for ev in sales_data if target_url in ev.get("url", "") or ev.get("url", "") in target_url]
        if filtered:
            sales_data = filtered

    generation_date = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Cálculos globales
    grand_pagados = 0
    grand_cortesias = 0
    grand_total_boletos = 0
    grand_recaudo_entradas = 0
    grand_recaudo_servicio = 0

    for ev in sales_data:
        resumen = ev.get("resumenLocalidades", [])
        for loc in resumen:
            cortesias = loc.get("cortesias", 0)
            pagados = loc.get("boletosPagados", 0)
            tot_boletos = loc.get("totalBoletos", clean_int(loc.get("vendidas", 0)))
            r_ent = clean_currency(loc.get("recaudoEntradas", 0))
            r_ser = clean_currency(loc.get("recaudoServicio", 0))

            grand_pagados += pagados
            grand_cortesias += cortesias
            grand_total_boletos += tot_boletos
            grand_recaudo_entradas += r_ent
            grand_recaudo_servicio += r_ser

    grand_total_cop = grand_recaudo_entradas + grand_recaudo_servicio
    grand_entrega_empresario = sum(
        ev.get("entregaEmpresario", {}).get("total", 0) 
        for ev in sales_data 
        if ev.get("entregaEmpresario")
    )

    def get_ee_badge(ev):
        ee = ev.get("entregaEmpresario")
        if ee and ee.get("total", 0) > 0:
            formatted = ee.get("totalFormatted") or format_cop(ee.get("total", 0))
            return f'<span class="badge" style="background: #fef3c7; color: #92400e; border: 1px solid #fde68a; font-weight: 700; margin-left: 6px;">💼 Entrega Empresario: {formatted}</span>'
        return ""

    # Título principal del reporte
    if mode == "general":
        report_title = "INFORME CONSOLIDADO DE VENTAS Y CORTESÍAS"
        report_subtitle = f"Ventas de todos los eventos activos a la venta ({len(sales_data)} eventos en total)"
    else:
        ev_first = sales_data[0] if sales_data else {}
        ev_meta = ev_first.get("meta", {})
        ev_name = ev_meta.get("evento", "Evento QRBoletos")
        sub_type_label = "DETALLADO POR CANAL" if report_type == "detailed" else "RESUMEN POR LOCALIDAD"
        report_title = f"INFORME DE VENTAS: {ev_name.upper()}"
        report_subtitle = f"Modalidad: {sub_type_label} | Función: {ev_meta.get('espectaculo', 'General')}"

    css = build_css(layout)

    # ----------------------------------------------------
    # GENERAR HTML SEGÚN EL LAYOUT
    # ----------------------------------------------------
    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>{report_title}</title>
<style>
{css}
</style>
</head>
<body>
"""

    if layout == "compact_landscape":
        # ----------------------------------------------------
        # LAYOUT 1: HORIZONTAL ULTRA-COMPACTO
        # ----------------------------------------------------
        html += f"""
        <div class="header">
            <div>
                <div class="brand-title">{report_title}</div>
                <div class="brand-subtitle">{report_subtitle}</div>
            </div>
            <div class="header-meta">
                <div>Fecha Emisión: <strong>{generation_date}</strong></div>
                <div>Plataforma: <strong>QRBoletos.com</strong></div>
            </div>
        </div>

        <div class="ticker-bar">
            <div class="ticker-item"><span class="ticker-label">Boletos Pagados:</span> <span class="ticker-val">{format_num(grand_pagados)}</span></div>
            <div class="ticker-item"><span class="ticker-label">Cortesías:</span> <span class="ticker-val cortesia">{format_num(grand_cortesias)}</span></div>
            <div class="ticker-item"><span class="ticker-label">Total Boletos:</span> <span class="ticker-val">{format_num(grand_total_boletos)}</span></div>
            <div class="ticker-item"><span class="ticker-label">Recaudo Entradas:</span> <span class="ticker-val highlight">{format_cop(grand_recaudo_entradas)}</span></div>
            <div class="ticker-item"><span class="ticker-label">Cover Service:</span> <span class="ticker-val service">{format_cop(grand_recaudo_servicio)}</span></div>
            <div class="ticker-item"><span class="ticker-label">Gran Total:</span> <span class="ticker-val highlight" style="color: #60a5fa;">{format_cop(grand_total_cop)}</span></div>
            {f'<div class="ticker-item"><span class="ticker-label" style="color: #d97706;">Entrega Empresario:</span> <span class="ticker-val" style="color: #d97706;">{format_cop(grand_entrega_empresario)}</span></div>' if grand_entrega_empresario > 0 else ''}
        </div>
        """

        for ev in sales_data:
            meta = ev.get("meta", {})
            resumen = ev.get("resumenLocalidades", [])
            ev_name = meta.get("evento", "Evento QRBoletos")
            esp_name = meta.get("espectaculo", "")
            sitio = meta.get("sitio", "N/A")
            pulep = meta.get("pulep", "N/A")
            fecha = meta.get("fechaInicio", "")

            e_pag = sum(l.get("boletosPagados", 0) for l in resumen)
            e_cor = sum(l.get("cortesias", 0) for l in resumen)
            e_bol = sum(l.get("totalBoletos", clean_int(l.get("vendidas", 0))) for l in resumen)
            e_ent = sum(clean_currency(l.get("recaudoEntradas", 0)) for l in resumen)
            e_ser = sum(clean_currency(l.get("recaudoServicio", 0)) for l in resumen)
            e_tot = e_ent + e_ser

            html += f"""
            <div class="event-section">
                <div class="event-bar">
                    <span>{ev_name} {f'({esp_name})' if esp_name else ''} {get_ee_badge(ev)}</span>
                    <div class="details">
                        {f'<span>PULEP: <strong>{pulep}</strong></span>' if pulep != 'N/A' else ''}
                        {f'<span>Lugar: <strong>{sitio}</strong></span>' if sitio != 'N/A' else ''}
                        {f'<span>Fecha: <strong>{fecha}</strong></span>' if fecha else ''}
                    </div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th style="width: 25%;">Localidad</th>
                            <th class="text-right" style="width: 12%;">Boletos Pagados</th>
                            <th class="text-right" style="width: 13%;">Cortesías Emitidas</th>
                            <th class="text-right" style="width: 12%;">Total Boletos</th>
                            <th class="text-right" style="width: 13%;">Recaudo Entradas (COP)</th>
                            <th class="text-right" style="width: 12%;">Cover Service (COP)</th>
                            <th class="text-right" style="width: 13%;">Total Recaudo (COP)</th>
                        </tr>
                    </thead>
                    <tbody>
            """
            for loc in resumen:
                l_name = loc.get("localidad", "")
                l_pag = loc.get("boletosPagados", 0)
                l_cor = loc.get("cortesias", 0)
                l_tot_b = loc.get("totalBoletos", clean_int(loc.get("vendidas", 0)))
                l_r_ent = clean_currency(loc.get("recaudoEntradas", 0))
                l_r_ser = clean_currency(loc.get("recaudoServicio", 0))
                l_tot_c = l_r_ent + l_r_ser

                html += f"""
                <tr>
                    <td><strong>{l_name}</strong></td>
                    <td class="text-right font-mono">{format_num(l_pag)}</td>
                    <td class="text-right font-mono" style="color: {'#b91c1c' if l_cor > 0 else '#64748b'}; font-weight: {'700' if l_cor > 0 else 'normal'};">{format_num(l_cor)}</td>
                    <td class="text-right font-mono"><strong>{format_num(l_tot_b)}</strong></td>
                    <td class="text-right font-mono" style="color: #059669;">{format_cop(l_r_ent)}</td>
                    <td class="text-right font-mono" style="color: #7c3aed;">{format_cop(l_r_ser)}</td>
                    <td class="text-right font-mono" style="font-weight: 700;">{format_cop(l_tot_c)}</td>
                </tr>
                """

            html += f"""
                    <tr class="row-total">
                        <td>SUBTOTAL {ev_name.upper()}</td>
                        <td class="text-right font-mono">{format_num(e_pag)}</td>
                        <td class="text-right font-mono">{format_num(e_cor)}</td>
                        <td class="text-right font-mono">{format_num(e_bol)}</td>
                        <td class="text-right font-mono">{format_cop(e_ent)}</td>
                        <td class="text-right font-mono">{format_cop(e_ser)}</td>
                        <td class="text-right font-mono">{format_cop(e_tot)}</td>
                    </tr>
                    </tbody>
                </table>
            </div>
            """

        html += f"""
        <div class="footer">
            <span>Informe Consolidado Horizontal Ultra-Compacto generado por QRBoletos Dashboard Helper</span>
            <span>Fecha de emisión: {generation_date}</span>
        </div>
        """

    elif layout == "onepage_portrait":
        # ----------------------------------------------------
        # LAYOUT 2: VERTICAL FICHA ONE-PAGE (1 PÁGINA POR EVENTO)
        # ----------------------------------------------------
        for ev in sales_data:
            meta = ev.get("meta", {})
            resumen = ev.get("resumenLocalidades", [])
            ev_name = meta.get("evento", "Evento QRBoletos")
            esp_name = meta.get("espectaculo", "")
            sitio = meta.get("sitio", "N/A")
            pulep = meta.get("pulep", "N/A")
            f_ini = meta.get("fechaInicio", "")
            f_fin = meta.get("fechaFin", "")

            e_pag = sum(l.get("boletosPagados", 0) for l in resumen)
            e_cor = sum(l.get("cortesias", 0) for l in resumen)
            e_bol = sum(l.get("totalBoletos", clean_int(l.get("vendidas", 0))) for l in resumen)
            e_ent = sum(clean_currency(l.get("recaudoEntradas", 0)) for l in resumen)
            e_ser = sum(clean_currency(l.get("recaudoServicio", 0)) for l in resumen)
            e_tot = e_ent + e_ser

            html += f"""
            <div class="page-event">
                <div>
                    <!-- Cabecera Oficial -->
                    <div class="formal-header">
                        <div>
                            <div class="formal-title">QRBOLETOS - ACTA DE LIQUIDACIÓN DE BOLETERÍA</div>
                            <div class="formal-subtitle">INFORME OFICIAL DE VENTAS, AFORO Y CORTESÍAS</div>
                        </div>
                        <div class="formal-meta">
                            <div>Fecha Emisión: <strong>{generation_date}</strong></div>
                            <div>Código PULEP: <strong>{pulep}</strong></div>
                        </div>
                    </div>

                    <!-- Tarjeta de Información del Evento -->
                    <div class="event-card-box">
                        <div class="event-card-title">{ev_name} {get_ee_badge(ev)}</div>
                        <div class="event-card-grid">
                            <div>Función / Fecha: <strong>{esp_name or 'General'}</strong></div>
                            <div>Recinto / Sitio: <strong>{sitio}</strong></div>
                            <div>Fecha y Hora Inicio: <strong>{f_ini or 'No registrada'}</strong></div>
                            <div>Fecha y Hora Fin: <strong>{f_fin or 'No registrada'}</strong></div>
                            {f'<div>Entrega a Empresario: <strong style="color: #b45309;">{ev.get("entregaEmpresario", {}).get("totalFormatted", "")}</strong></div>' if ev.get("entregaEmpresario") and ev.get("entregaEmpresario", {}).get("total", 0) > 0 else ''}
                        </div>
                    </div>

                    <!-- Matriz de 3x2 Tarjetas KPI -->
                    <div class="kpi-matrix">
                        <div class="kpi-box">
                            <div class="kpi-box-label">Boletos Pagados</div>
                            <div class="kpi-box-value">{format_num(e_pag)}</div>
                        </div>
                        <div class="kpi-box cortesia">
                            <div class="kpi-box-label">Cortesías Emitidas</div>
                            <div class="kpi-box-value" style="color: #b91c1c;">{format_num(e_cor)}</div>
                        </div>
                        <div class="kpi-box">
                            <div class="kpi-box-label">Aforo Total Emitido</div>
                            <div class="kpi-box-value">{format_num(e_bol)}</div>
                        </div>
                        <div class="kpi-box highlight">
                            <div class="kpi-box-label">Recaudo Entradas (COP)</div>
                            <div class="kpi-box-value" style="color: #059669;">{format_cop(e_ent)}</div>
                        </div>
                        <div class="kpi-box">
                            <div class="kpi-box-label">Cover Service (COP)</div>
                            <div class="kpi-box-value" style="color: #7c3aed;">{format_cop(e_ser)}</div>
                        </div>
                        <div class="kpi-box" style="background: #eff6ff; border-color: #93c5fd;">
                            <div class="kpi-box-label">Gran Total Recaudo (COP)</div>
                            <div class="kpi-box-value" style="color: #1d4ed8;">{format_cop(e_tot)}</div>
                        </div>
                    </div>

                    <!-- Tabla de Localidades y Cortesías -->
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 25%;">Localidad</th>
                                <th class="text-right" style="width: 12%;">Boletos Pagados</th>
                                <th class="text-right" style="width: 13%;">Cortesías Emitidas</th>
                                <th class="text-right" style="width: 12%;">Total Boletos</th>
                                <th class="text-right" style="width: 13%;">Recaudo Entradas (COP)</th>
                                <th class="text-right" style="width: 12%;">Cover Service (COP)</th>
                                <th class="text-right" style="width: 13%;">Total Recaudo (COP)</th>
                            </tr>
                        </thead>
                        <tbody>
            """

            for loc in resumen:
                l_name = loc.get("localidad", "")
                l_pag = loc.get("boletosPagados", 0)
                l_cor = loc.get("cortesias", 0)
                l_tot_b = loc.get("totalBoletos", clean_int(loc.get("vendidas", 0)))
                l_r_ent = clean_currency(loc.get("recaudoEntradas", 0))
                l_r_ser = clean_currency(loc.get("recaudoServicio", 0))
                l_tot_c = l_r_ent + l_r_ser

                html += f"""
                <tr>
                    <td><strong>{l_name}</strong></td>
                    <td class="text-right font-mono">{format_num(l_pag)}</td>
                    <td class="text-right font-mono" style="color: {'#b91c1c' if l_cor > 0 else '#64748b'}; font-weight: {'700' if l_cor > 0 else 'normal'};">{format_num(l_cor)}</td>
                    <td class="text-right font-mono"><strong>{format_num(l_tot_b)}</strong></td>
                    <td class="text-right font-mono" style="color: #059669;">{format_cop(l_r_ent)}</td>
                    <td class="text-right font-mono" style="color: #7c3aed;">{format_cop(l_r_ser)}</td>
                    <td class="text-right font-mono" style="font-weight: 700;">{format_cop(l_tot_c)}</td>
                </tr>
                """

            html += f"""
                        <tr class="row-total">
                            <td>TOTAL CONSOLIDADO</td>
                            <td class="text-right font-mono">{format_num(e_pag)}</td>
                            <td class="text-right font-mono" style="color: #b91c1c;">{format_num(e_cor)}</td>
                            <td class="text-right font-mono">{format_num(e_bol)}</td>
                            <td class="text-right font-mono">{format_cop(e_ent)}</td>
                            <td class="text-right font-mono">{format_cop(e_ser)}</td>
                            <td class="text-right font-mono">{format_cop(e_tot)}</td>
                        </tr>
                        </tbody>
                    </table>
                </div>

                <!-- Sección de Firmas de Conformidad al pie -->
                <div class="signatures-section">
                    <div class="signatures-title">Constancia de Liquidación de Aforo y Recaudo Oficial</div>
                    <div class="signatures-grid">
                        <div class="sig-box">
                            <div class="sig-name">_____________________________________________</div>
                            <div class="sig-role">Promotor / Productor Responsable</div>
                            <div style="font-size: 8.5px; color: #94a3b8; margin-top: 2px;">C.C. / NIT: ______________________</div>
                        </div>
                        <div class="sig-box">
                            <div class="sig-name">_____________________________________________</div>
                            <div class="sig-role">Auditor / Delegado Oficial QRBoletos</div>
                            <div style="font-size: 8.5px; color: #94a3b8; margin-top: 2px;">Fecha de Firma: {generation_date.split(' ')[0]}</div>
                        </div>
                    </div>
                </div>

                <div class="footer">
                    <span>Ficha técnica de liquidación One-Page generada por QRBoletos Dashboard Helper</span>
                    <span>Documento Oficial de Liquidación</span>
                </div>
            </div>
            """

    else:
        # ----------------------------------------------------
        # LAYOUT 3: ESTÁNDAR VERTICAL (LA ACTUAL ADAPTADA A RETRATO)
        # ----------------------------------------------------
        html += f"""
        <div class="header">
            <div>
                <div class="brand-title">{report_title}</div>
                <div class="brand-subtitle">{report_subtitle}</div>
            </div>
            <div class="header-meta">
                <div>Fecha Emisión: <strong>{generation_date}</strong></div>
                <div>Plataforma: <strong>QRBoletos.com</strong></div>
            </div>
        </div>
        """

        if mode == "general" or (mode == "individual" and report_type == "general"):
            for ev in sales_data:
                meta = ev.get("meta", {})
                resumen = ev.get("resumenLocalidades", [])
                ev_name = meta.get("evento", "Evento QRBoletos")
                esp_name = meta.get("espectaculo", "")
                sitio = meta.get("sitio", "N/A")
                pulep = meta.get("pulep", "N/A")
                fecha = meta.get("fechaInicio", "")

                e_pag = sum(l.get("boletosPagados", 0) for l in resumen)
                e_cor = sum(l.get("cortesias", 0) for l in resumen)
                e_bol = sum(l.get("totalBoletos", clean_int(l.get("vendidas", 0))) for l in resumen)
                e_ent = sum(clean_currency(l.get("recaudoEntradas", 0)) for l in resumen)
                e_ser = sum(clean_currency(l.get("recaudoServicio", 0)) for l in resumen)
                e_tot = e_ent + e_ser

                html += f"""
                <div class="event-section">
                    <div class="event-header">
                        <div class="event-title">{ev_name} {f'<span class="badge badge-primary">{esp_name}</span>' if esp_name else ''} {get_ee_badge(ev)}</div>
                        <div class="event-details">
                            {f'<span>PULEP: <strong>{pulep}</strong></span>' if pulep != 'N/A' else ''}
                            {f'<span>Lugar: <strong>{sitio}</strong></span>' if sitio != 'N/A' else ''}
                        </div>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 25%;">Localidad</th>
                                <th class="text-right" style="width: 12%;">Boletos Pagados</th>
                                <th class="text-right" style="width: 13%;">Cortesías Emitidas</th>
                                <th class="text-right" style="width: 12%;">Total Boletos</th>
                                <th class="text-right" style="width: 13%;">Recaudo Entradas (COP)</th>
                                <th class="text-right" style="width: 12%;">Cover Service (COP)</th>
                                <th class="text-right" style="width: 13%;">Total Recaudo (COP)</th>
                            </tr>
                        </thead>
                        <tbody>
                """
                for loc in resumen:
                    l_name = loc.get("localidad", "")
                    l_pag = loc.get("boletosPagados", 0)
                    l_cor = loc.get("cortesias", 0)
                    l_tot_b = loc.get("totalBoletos", clean_int(loc.get("vendidas", 0)))
                    l_r_ent = clean_currency(loc.get("recaudoEntradas", 0))
                    l_r_ser = clean_currency(loc.get("recaudoServicio", 0))
                    l_tot_c = l_r_ent + l_r_ser

                    html += f"""
                    <tr>
                        <td><strong>{l_name}</strong></td>
                        <td class="text-right font-mono">{format_num(l_pag)}</td>
                        <td class="text-right font-mono" style="color: {'#b91c1c' if l_cor > 0 else '#64748b'}; font-weight: {'700' if l_cor > 0 else 'normal'};">{format_num(l_cor)}</td>
                        <td class="text-right font-mono"><strong>{format_num(l_tot_b)}</strong></td>
                        <td class="text-right font-mono" style="color: #059669;">{format_cop(l_r_ent)}</td>
                        <td class="text-right font-mono" style="color: #7c3aed;">{format_cop(l_r_ser)}</td>
                        <td class="text-right font-mono" style="font-weight: 700;">{format_cop(l_tot_c)}</td>
                    </tr>
                    """

                html += f"""
                        <tr class="row-total">
                            <td>TOTAL {ev_name.upper()}</td>
                            <td class="text-right font-mono">{format_num(e_pag)}</td>
                            <td class="text-right font-mono">{format_num(e_cor)}</td>
                            <td class="text-right font-mono">{format_num(e_bol)}</td>
                            <td class="text-right font-mono">{format_cop(e_ent)}</td>
                            <td class="text-right font-mono">{format_cop(e_ser)}</td>
                            <td class="text-right font-mono">{format_cop(e_tot)}</td>
                        </tr>
                        </tbody>
                    </table>
                </div>
                """


        elif mode == "individual" and report_type == "detailed":
            for ev in sales_data:
                meta = ev.get("meta", {})
                detalles = ev.get("detalleCanales", [])
                ev_name = meta.get("evento", "Evento QRBoletos")
                esp_name = meta.get("espectaculo", "")
                sitio = meta.get("sitio", "N/A")
                pulep = meta.get("pulep", "N/A")

                tot_cant = sum(clean_int(d.get("cantidad", 0)) for d in detalles)
                tot_entradas = sum(clean_currency(d.get("totalEntradas", 0)) for d in detalles)
                tot_servicio = sum(clean_currency(d.get("totalServicio", 0)) for d in detalles)

                html += f"""
                <div class="event-section">
                    <div class="event-header">
                        <div class="event-title">{ev_name} {f'<span class="badge badge-primary">{esp_name}</span>' if esp_name else ''}</div>
                        <div class="event-details">
                            <span>PULEP: <strong>{pulep}</strong></span>
                            <span>Sitio: <strong>{sitio}</strong></span>
                        </div>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>Localidad</th>
                                <th>Etapa</th>
                                <th>Referencia</th>
                                <th>Canal</th>
                                <th>Tipo</th>
                                <th class="text-right">Cant.</th>
                                <th class="text-right">Val. Entrada</th>
                                <th class="text-right">Total Entradas</th>
                                <th class="text-right">Val. Servicio</th>
                                <th class="text-right">Total Servicio</th>
                            </tr>
                        </thead>
                        <tbody>
                """
                for d in detalles:
                    is_cor = d.get("isCortesia", False)
                    canal_str = d.get("canal", "")
                    is_web = "web" in canal_str.lower()
                    c_cant = clean_int(d.get("cantidad", 0))
                    c_v_ent = clean_currency(d.get("valorEntrada", 0))
                    c_t_ent = clean_currency(d.get("totalEntradas", 0))
                    c_v_ser = clean_currency(d.get("valorServicio", 0))
                    c_t_ser = clean_currency(d.get("totalServicio", 0))

                    html += f"""
                    <tr>
                        <td><strong>{d.get('localidad', '')}</strong></td>
                        <td>{d.get('etapa', '')}</td>
                        <td>{d.get('referencia', '')}</td>
                        <td><span class="{ 'tag-web' if is_web else 'tag-pos' }">{canal_str}</span></td>
                        <td><span class="{ 'tag-cortesia' if is_cor else '' }">{ 'CORTESÍA' if is_cor else 'PAGADO' }</span></td>
                        <td class="text-right font-mono"><strong>{format_num(c_cant)}</strong></td>
                        <td class="text-right font-mono">{format_cop(c_v_ent)}</td>
                        <td class="text-right font-mono" style="color: #059669;">{format_cop(c_t_ent)}</td>
                        <td class="text-right font-mono">{format_cop(c_v_ser)}</td>
                        <td class="text-right font-mono" style="color: #7c3aed;">{format_cop(c_t_ser)}</td>
                    </tr>
                    """

                html += f"""
                        <tr class="row-total">
                            <td colspan="5">TOTALES DETALLADOS</td>
                            <td class="text-right font-mono">{format_num(tot_cant)}</td>
                            <td></td>
                            <td class="text-right font-mono">{format_cop(tot_entradas)}</td>
                            <td></td>
                            <td class="text-right font-mono">{format_cop(tot_servicio)}</td>
                        </tr>
                        </tbody>
                    </table>
                </div>
                """

        total_section_title = f"TOTAL CONSOLIDADO GENERAL ({len(sales_data)} EVENTOS)" if len(sales_data) > 1 else "TOTAL CONSOLIDADO"

        html += f"""
        <div style="margin-top: 18px; margin-bottom: 6px; font-weight: 800; font-size: 11px; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #0f172a; padding-bottom: 4px; page-break-inside: avoid;">
            {total_section_title}
        </div>
        <div class="kpi-grid" style="page-break-inside: avoid; margin-top: 6px; margin-bottom: 14px;">
            <div class="kpi-card">
                <div class="kpi-label">Boletos Pagados</div>
                <div class="kpi-value">{format_num(grand_pagados)}</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label" style="color: #b91c1c;">Cortesías Emitidas</div>
                <div class="kpi-value" style="color: #b91c1c;">{format_num(grand_cortesias)}</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Total Boletos</div>
                <div class="kpi-value">{format_num(grand_total_boletos)}</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Recaudo Entradas</div>
                <div class="kpi-value kpi-highlight">{format_cop(grand_recaudo_entradas)}</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Cover Service</div>
                <div class="kpi-value" style="color: #7c3aed;">{format_cop(grand_recaudo_servicio)}</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Gran Total COP</div>
                <div class="kpi-value" style="color: #0284c7;">{format_cop(grand_total_cop)}</div>
            </div>
        </div>
        {f'''
        <div style="margin-top: -6px; margin-bottom: 14px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 6px 12px; display: flex; justify-content: space-between; align-items: center; page-break-inside: avoid;">
            <span style="font-size: 9.5px; font-weight: 700; color: #92400e; text-transform: uppercase;">💼 Total Entrega a Empresario:</span>
            <span style="font-size: 12px; font-weight: 800; color: #b45309; font-family: ui-monospace, monospace;">{format_cop(grand_entrega_empresario)}</span>
        </div>
        ''' if grand_entrega_empresario > 0 else ''}

        <div class="footer">
            <span>Informe Oficial de Ventas generado por QRBoletos Dashboard Helper</span>
            <span>Fecha de emisión: {generation_date}</span>
        </div>
        """

    html += """
</body>
</html>
    """

    is_landscape = (layout == "compact_landscape")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_content(html, wait_until="networkidle")
        page.pdf(
            path=output_pdf,
            format="Letter",
            landscape=is_landscape,
            print_background=True,
            margin={"top": "8mm", "bottom": "8mm", "left": "10mm", "right": "10mm"}
        )
        browser.close()

    print(f"PDF generado exitosamente ({layout}) en: {output_pdf}")

def main():
    parser = argparse.ArgumentParser(description="Generar informe de ventas de QRBoletos en PDF")
    parser.add_argument("--sales-json", required=True, help="Ruta al archivo JSON con los datos de ventas")
    parser.add_argument("--output-pdf", required=True, help="Ruta de destino del archivo .pdf")
    parser.add_argument("--mode", default="general", choices=["general", "individual"], help="Modo del informe")
    parser.add_argument("--type", default="general", choices=["general", "detailed"], help="Tipo de informe (para individual)")
    parser.add_argument("--target-url", help="URL base del evento en caso de modo individual")
    parser.add_argument("--layout", default="standard_portrait", choices=["standard_portrait", "compact_landscape", "onepage_portrait"], help="Diseño de visualización del PDF")
    args = parser.parse_args()

    if not os.path.exists(args.sales_json):
        sys.stderr.write(f"Error: No existe el archivo {args.sales_json}\n")
        sys.exit(1)

    with open(args.sales_json, "r", encoding="utf-8") as f:
        data = json.load(f)

    sales_data = data.get("salesData", data) if isinstance(data, dict) else data

    if not isinstance(sales_data, list):
        sales_data = [sales_data]

    generate_pdf_report(
        sales_data=sales_data,
        output_pdf=args.output_pdf,
        mode=args.mode,
        report_type=args.type,
        target_url=args.target_url,
        layout=args.layout
    )

if __name__ == "__main__":
    main()
