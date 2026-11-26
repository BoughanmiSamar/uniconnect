'use client';

import { useState } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  User as UserIcon,
  Layers,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export interface SeanceViewItem {
  _id: string;
  date?: string;
  jour: string;
  heureDebut: string;
  heureFin: string;
  typeSeance?: string;
  matiere: { _id: string; nom: string; code: string; coefficient?: number };
  enseignant: { _id: string; nom: string };
  groupe: { _id: string; nom: string };
  salle: { _id: string; nom: string; type?: string };
}

interface Props {
  seances: SeanceViewItem[];
  title?: string;
  userRole?: 'admin' | 'teacher' | 'student';
}

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const MOIS_COURTS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

function getMondayOfWeek(d: Date): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, 12, 0, 0);
  return copy;
}

function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatShortDate(d: Date): string {
  return `${d.getDate()} ${MOIS_COURTS[d.getMonth()]}`;
}

function formatDayMonth(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function ScheduleWeeklyView({ seances, title = 'Emploi du temps' }: Props) {
  const today = new Date();
  const todayISO = formatDateISO(today);
  const todayDayIdx = today.getDay();
  const initialJour = todayDayIdx >= 1 && todayDayIdx <= 6 ? JOURS[todayDayIdx - 1] : 'Lundi';

  const [weekStart, setWeekStart] = useState<Date>(() => getMondayOfWeek(today));
  const [selectedJour, setSelectedJour] = useState<string>(initialJour);
  const [filterGroup, setFilterGroup] = useState<string>('all');

  // Extract distinct groups for filtering
  const groups = Array.from(new Set(seances.map((s) => s.groupe?.nom).filter(Boolean)));

  const filteredSeances = seances.filter((s) => {
    if (filterGroup !== 'all' && s.groupe?.nom !== filterGroup) return false;
    return true;
  });

  const weekDays = JOURS.map((jour, index) => {
    const dateObj = addDays(weekStart, index);
    return {
      jour,
      dateObj,
      dateISO: formatDateISO(dateObj),
      shortDate: formatShortDate(dateObj),
      dayMonth: formatDayMonth(dateObj),
    };
  });

  const seancesByDay: Record<string, SeanceViewItem[]> = {};
  weekDays.forEach(({ jour, dateISO }) => {
    seancesByDay[jour] = filteredSeances
      .filter((s) => {
        if (s.date) {
          return s.date === dateISO;
        }
        return s.jour === jour;
      })
      .sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
  });

  const weekEnd = addDays(weekStart, 5);
  const weekRangeLabel = `Semaine du ${formatShortDate(weekStart)} au ${formatShortDate(weekEnd)} ${weekEnd.getFullYear()}`;

  const handleJumpToDate = (dateValue: string) => {
    if (!dateValue) return;
    const parsed = new Date(`${dateValue}T12:00:00`);
    if (isNaN(parsed.getTime())) return;
    setWeekStart(getMondayOfWeek(parsed));
    const dayIdx = parsed.getDay();
    if (dayIdx >= 1 && dayIdx <= 6) {
      setSelectedJour(JOURS[dayIdx - 1]);
    }
  };

  const selectedDayInfo = weekDays.find((d) => d.jour === selectedJour) || weekDays[0];

  return (
    <div className="space-y-4">
      {/* Filters & Header */}
      <div className="flex flex-col gap-3 bg-white border border-slate-200 p-4 rounded-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center shrink-0">
              <CalendarIcon className="w-5 h-5 text-[#03c9d7]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">{title}</h2>
              <p className="text-xs text-slate-500">Agenda par date • {weekRangeLabel}</p>
            </div>
          </div>

          {groups.length > 1 && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-600">Filtrer par groupe :</label>
              <select
                value={filterGroup}
                onChange={(e) => setFilterGroup(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 font-medium text-slate-700"
              >
                <option value="all">Tous les groupes</option>
                {groups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Agenda Date Navigation Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setWeekStart((prev) => addDays(prev, -7))}
              className="p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors"
              title="Semaine précédente"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setWeekStart(getMondayOfWeek(new Date()));
                setSelectedJour(initialJour);
              }}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors"
            >
              Aujourd’hui
            </button>
            <button
              type="button"
              onClick={() => setWeekStart((prev) => addDays(prev, 7))}
              className="p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors"
              title="Semaine suivante"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-500">Aller à la date :</label>
            <input
              type="date"
              value={selectedDayInfo.dateISO}
              onChange={(e) => handleJumpToDate(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#03c9d7]"
            />
          </div>
        </div>
      </div>

      {/* Day Selector (Horizontal pills) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {weekDays.map(({ jour, dateISO, dayMonth }) => {
          const count = seancesByDay[jour]?.length || 0;
          const isSelected = selectedJour === jour;
          const isToday = dateISO === todayISO;

          return (
            <button
              key={jour}
              type="button"
              onClick={() => setSelectedJour(jour)}
              className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold shrink-0 transition-all flex items-center gap-1.5 ${
                isSelected
                  ? 'bg-[#03c9d7] text-white shadow-md shadow-cyan-500/20'
                  : isToday
                  ? 'bg-teal-50 text-[#03c9d7] border border-[#03c9d7]/40 hover:bg-teal-100/60'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span>{jour}</span>
              <span className={`text-[10px] font-normal ${isSelected ? 'text-white/85' : 'text-slate-400'}`}>
                {dayMonth}
              </span>
              {count > 0 && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected Day View (Cards on Mobile) */}
      <div className="block lg:hidden space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 px-1">
          Séances du {selectedDayInfo.jour} {selectedDayInfo.shortDate} ({seancesByDay[selectedJour]?.length || 0})
        </h3>

        {!seancesByDay[selectedJour] || seancesByDay[selectedJour].length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-sm">
            Aucun cours planifié pour le {selectedDayInfo.jour} {selectedDayInfo.shortDate}.
          </div>
        ) : (
          seancesByDay[selectedJour].map((s) => (
            <div
              key={s._id}
              className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:border-[#03c9d7]/50 transition-all space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 text-[#03c9d7] font-mono text-xs font-bold border border-teal-100">
                  <Clock className="w-3.5 h-3.5" />
                  {s.heureDebut} - {s.heureFin}
                </span>

                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                  {s.typeSeance || 'Cours'}
                </span>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 text-sm sm:text-base leading-snug">{s.matiere?.nom}</h4>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{s.matiere?.code}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs text-slate-600">
                <div className="flex items-center gap-1.5 truncate">
                  <UserIcon className="w-3.5 h-3.5 text-[#03c9d7] shrink-0" />
                  <span className="truncate">{s.enseignant?.nom}</span>
                </div>
                <div className="flex items-center gap-1.5 truncate">
                  <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="truncate font-semibold">{s.salle?.nom}</span>
                </div>
                <div className="flex items-center gap-1.5 truncate col-span-2">
                  <Layers className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span className="font-medium text-slate-700">Groupe : {s.groupe?.nom}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Weekly Grid (>= 1024px) */}
      <div className="hidden lg:grid grid-cols-6 gap-3">
        {weekDays.map(({ jour, dateISO, shortDate }) => {
          const isToday = dateISO === todayISO;
          return (
            <div
              key={jour}
              className={`border rounded-2xl p-3 flex flex-col min-h-[480px] ${
                isToday ? 'bg-teal-50/30 border-[#03c9d7]/40' : 'bg-slate-50/70 border-slate-200'
              }`}
            >
              <div className="text-center border-b border-slate-200 pb-2 mb-3">
                <div className={`font-bold text-sm ${isToday ? 'text-[#03c9d7]' : 'text-slate-700'}`}>{jour}</div>
                <div className="text-[11px] font-medium text-slate-400">{shortDate}</div>
              </div>

              <div className="space-y-2.5 flex-1">
                {!seancesByDay[jour] || seancesByDay[jour].length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400 italic">
                    Aucun cours
                  </div>
                ) : (
                  seancesByDay[jour].map((s) => (
                    <div
                      key={s._id}
                      className="bg-white border border-slate-200/90 rounded-xl p-3 shadow-xs hover:shadow-md hover:border-[#03c9d7] transition-all text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-[11px] font-mono text-[#03c9d7] font-bold">
                        <span>
                          {s.heureDebut}-{s.heureFin}
                        </span>
                        <span className="text-[10px] text-slate-500 uppercase">{s.typeSeance}</span>
                      </div>

                      <p className="font-bold text-slate-800 line-clamp-2 leading-tight">{s.matiere?.nom}</p>

                      <div className="text-[11px] text-slate-600 space-y-0.5 pt-1 border-t border-slate-100">
                        <p className="truncate">👤 {s.enseignant?.nom}</p>
                        <p className="truncate font-semibold text-teal-800">📍 {s.salle?.nom}</p>
                        <p className="truncate text-slate-500">👥 {s.groupe?.nom}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
