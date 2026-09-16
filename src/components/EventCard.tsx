'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Evento } from '@/types';
import { formatDateString } from '@/utils/dateFormatter';
import {
  Layers,
  Trash2,
  Star,
  ExternalLink,
  Eye,
  Globe,
  Palette,
  Settings,
  MoreVertical,
  Calendar,
  MapPin,
  Users
} from 'lucide-react';

interface EventCardProps {
  evento: Evento;
  onToggleFavorite: (id: string, currentStatus: boolean) => void;
  onDeleteEvent: (id: string) => void;
  onOpenLocalities: (evento: Evento) => void;
  onOpenArtworks?: (evento: Evento) => void;
  onConfigureSettings?: (evento: Evento) => void;
  onCheckAvailability?: (evento: Evento) => void;
}

export default function EventCard({
  evento,
  onToggleFavorite,
  onDeleteEvent,
  onOpenLocalities,
  onOpenArtworks,
  onConfigureSettings,
  onCheckAvailability,
}: EventCardProps) {
  const [imgError, setImgError] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (evento.id) {
      onToggleFavorite(evento.id, evento.favorito);
    }
  };

  const handleDeleteClick = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsMenuOpen(false);
    if (evento.id && confirm(`¿Estás seguro de que deseas eliminar "${evento.nombre}"?`)) {
      onDeleteEvent(evento.id);
    }
  };

  // Cerrar menú al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  const imageSrc = evento.imageUrl || (evento as any).imagen;
  const isOnSale = evento.enVenta !== false;
  const localitiesCount = evento.localidades?.length || 0;

  return (
    <article
      className={`group relative bg-slate-900 border rounded-2xl p-4 sm:p-5 shadow-lg hover:shadow-2xl transition-all duration-200 flex flex-col justify-between focus-within:ring-2 focus-within:ring-emerald-500/80 ${!isOnSale
        ? 'border-amber-500/30 hover:border-amber-500/60 bg-gradient-to-b from-slate-900 via-slate-900 to-amber-950/15'
        : 'border-slate-800 hover:border-slate-700/80 hover:shadow-emerald-950/10'
        }`}
      aria-labelledby={`event-title-${evento.id}`}
    >
      <div>
        {/* 1. Flyer / Banner del Evento */}
        <div className="w-full aspect-[80/60] relative rounded-xl overflow-hidden mb-3.5 border border-slate-800/90 bg-slate-950 flex items-center justify-center group-hover:border-emerald-500/40 transition-all">
          {imageSrc && !imgError ? (
            <img
              src={imageSrc}
              alt={`Afiche del evento ${evento.nombre}`}
              onError={() => setImgError(true)}
              className="w-full h-full object-cover object-top scale-[1.02] group-hover:scale-[1.08] transition-transform duration-1000 ease-out"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 flex flex-col items-center justify-center text-slate-500 font-mono text-[11px] tracking-wider select-none uppercase font-bold gap-1.5">
              <Layers className="w-6 h-6 text-slate-700" />
              <span>QRBoletos</span>
            </div>
          )}

          {/* Gradiente sutil para legibilidad de badges */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/30 via-transparent to-black/60 pointer-events-none" />

          {/* Badges Superiores Izquierdos: ID y Estado */}
          <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 flex-wrap z-10">
            {evento.id && (
              <span className="bg-black/80 backdrop-blur-md text-emerald-400 border border-emerald-500/40 px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold shadow-md">
                #{evento.id}
              </span>
            )}
            <span
              className={`backdrop-blur-md px-2 py-0.5 rounded-lg text-[10px] font-bold tracking-wide shadow-md flex items-center gap-1 ${isOnSale
                ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-500/50'
                : 'bg-amber-950/90 text-amber-300 border border-amber-500/50'
                }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isOnSale ? 'bg-emerald-400' : 'bg-amber-400'} animate-pulse`} />
              <span>{isOnSale ? 'EN VENTA' : 'CONFIGURACIÓN'}</span>
            </span>
          </div>

          {/* Acciones Rápidas en Esquina Superior Derecha: Favorito y Menú de Opciones */}
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-10">
            <button
              type="button"
              onClick={handleFavoriteClick}
              aria-label={evento.favorito ? `Quitar ${evento.nombre} de favoritos` : `Marcar ${evento.nombre} como favorito`}
              className={`p-2 rounded-xl backdrop-blur-md border transition-all cursor-pointer shadow-md active:scale-90 ${evento.favorito
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/50 hover:bg-amber-500/30'
                : 'bg-black/60 text-slate-300 border-white/10 hover:text-amber-400 hover:bg-black/80'
                }`}
            >
              <Star className="w-3.5 h-3.5" fill={evento.favorito ? 'currentColor' : 'none'} />
            </button>

            {/* Menú Contextual Dropdown */}
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMenuOpen(!isMenuOpen);
                }}
                aria-label={`Opciones adicionales para ${evento.nombre}`}
                aria-expanded={isMenuOpen}
                className="p-2 rounded-xl bg-black/60 hover:bg-black/80 text-slate-200 hover:text-white backdrop-blur-md border border-white/10 transition-all cursor-pointer shadow-md active:scale-90"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>

              {isMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-48 bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-xl shadow-2xl py-1.5 z-30 animate-in fade-in slide-in-from-top-1 duration-150 space-y-0.5">
                  {evento.enlace && (
                    <a
                      href={evento.enlace}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setIsMenuOpen(false)}
                      aria-label={`Abrir página oficial de ${evento.nombre} en qrboletos.com`}
                      className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-800/80 flex items-center gap-2 transition-colors"
                    >
                      <Globe className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Ver en QRBoletos.com</span>
                    </a>
                  )}
                  {onOpenArtworks && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false);
                        onOpenArtworks(evento);
                      }}
                      className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-800/80 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <Palette className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>🎨 Actualizar Artes</span>
                    </button>
                  )}
                  {onConfigureSettings && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false);
                        onConfigureSettings(evento);
                      }}
                      className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-800/80 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <Settings className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <span>⚙️ Configurar Evento</span>
                    </button>
                  )}
                  {onCheckAvailability && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false);
                        onCheckAvailability(evento);
                      }}
                      className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-800/80 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <span className="text-emerald-400 text-xs">🎟️</span>
                      <span>Aforo y Cupos en Vivo</span>
                    </button>
                  )}
                  <div className="my-1 border-t border-slate-800" />
                  <button
                    type="button"
                    onClick={handleDeleteClick}
                    className="w-full px-3 py-2 text-left text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Eliminar Evento</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 2. Jerarquía Tipográfica y Metadatos del Evento */}
        <div className="space-y-1.5 mb-3.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
            <Calendar className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <time dateTime={evento.fecha} className="tracking-wide">
              {formatDateString(evento.fecha)}
            </time>
          </div>

          <h3
            id={`event-title-${evento.id}`}
            className="text-base font-bold text-slate-100 group-hover:text-emerald-400 transition-colors line-clamp-2 leading-snug"
            title={evento.nombre}
          >
            {evento.nombre}
          </h3>

          {evento.espectaculo && evento.espectaculo !== evento.nombre && (
            <p className="text-xs text-amber-300/90 font-medium line-clamp-1 flex items-center gap-1">
              <span className="text-slate-400 font-normal">Función:</span> {evento.espectaculo}
            </p>
          )}

          {evento.sitio && (
            <p className="flex items-center gap-1.5 text-xs text-slate-300 line-clamp-1">
              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>{evento.sitio}</span>
            </p>
          )}
        </div>
      </div>

      {/* 3. Acciones y Pie de Tarjeta */}
      <div className="pt-3 border-t border-slate-800/80 space-y-2.5">
        {/* Contadores y Fecha de Registro (Contraste > 5:1) */}
        <div className="flex items-center justify-between text-xs text-slate-300">
          <span className="flex items-center gap-1.5 font-medium">
            <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>{localitiesCount} Localidad{localitiesCount !== 1 ? 'es' : ''}</span>
          </span>
          <span className="font-mono text-[11px] text-slate-400">
            {evento.fechaCreacion ? `Añadido: ${evento.fechaCreacion}` : `ID: #${evento.id}`}
          </span>
        </div>

        {/* Botón Principal de Ancho Completo: Gestionar Localidades */}
        <button
          type="button"
          onClick={() => onOpenLocalities(evento)}
          aria-label={`Gestionar aforo y localidades de ${evento.nombre}`}
          className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${localitiesCount > 0
            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40'
            : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
            }`}
        >
          <Eye className="w-4 h-4 shrink-0" />
          <span>Gestionar Localidades</span>
          {localitiesCount > 0 && (
            <span className="bg-black/25 text-white text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ml-0.5">
              {localitiesCount}
            </span>
          )}
        </button>

        {/* Barra de Acciones Secundarias Rápidas */}
        <div className="grid grid-cols-2 gap-1.5 pt-0.5">
          {onOpenArtworks && (
            <button
              type="button"
              onClick={() => onOpenArtworks(evento)}
              className="py-1.5 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 bg-slate-800/80 hover:bg-slate-800 text-amber-300 hover:text-amber-200 border border-slate-700/60 hover:border-amber-500/40 transition-all cursor-pointer active:scale-95"
              title="Actualizar artes y afiches en Chrome"
            >
              <Palette className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Artes</span>
            </button>
          )}
          {onConfigureSettings && (
            <button
              type="button"
              onClick={() => onConfigureSettings(evento)}
              className="py-1.5 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 bg-slate-800/80 hover:bg-slate-800 text-blue-300 hover:text-blue-200 border border-slate-700/60 hover:border-blue-500/40 transition-all cursor-pointer active:scale-95"
              title="Configurar switches y restricciones del evento"
            >
              <Settings className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>Configurar</span>
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
