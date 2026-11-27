'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  Plus,
  Trash2,
  Building,
  Pencil,
  CheckCircle2,
  AlertTriangle,
  X,
  Loader2,
  Sparkles,
  Wand2,
  ArrowRight,
} from 'lucide-react';
import {
  createSalleAction,
  deleteSalleAction,
  createSeanceAction,
  updateSeanceAction,
  deleteSeanceAction,
} from '@/app/(modules)/schedule/actions';
import {
  parseSchedulePromptAction,
  suggestScheduleAlternativesAction,
  ConflictAlternative,
} from '@/app/(modules)/schedule/ai-actions';
import ScheduleWeeklyView, { SeanceViewItem } from '@/components/modules/ScheduleWeeklyView';

export interface SimpleOption {
  _id: string;
  nom: string;
  code?: string;
  capacite?: number;
  type?: string;
}

interface Props {
  seances: SeanceViewItem[];
  salles: SimpleOption[];
  matieres: SimpleOption[];
  teachers: SimpleOption[];
  groups: SimpleOption[];
}

interface ConflictContext {
  mode: 'create' | 'edit';
  date: string;
  heureDebut: string;
  heureFin: string;
  enseignantId: string;
  groupeId: string;
  salleId: string;
  conflictType?: 'salle' | 'enseignant' | 'groupe';
  excludeId?: string;
}

interface PopupState {
  type: 'success' | 'error';
  title: string;
  message: string;
  conflictContext?: ConflictContext;
}

interface SeanceFormValues {
  date: string;
  heureDebut: string;
  heureFin: string;
  typeSeance: string;
  matiere: string;
  enseignant: string;
  groupe: string;
  salle: string;
}

const JOURS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

function getTodayValidDateISO(): string {
  const now = new Date();
  if (now.getDay() === 0) {
    now.setDate(now.getDate() + 1);
  }
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getNextDateForJour(jour: string): string {
  const targetIdx = JOURS_FR.indexOf(jour);
  if (targetIdx <= 0) return getTodayValidDateISO();
  const now = new Date();
  const diff = (targetIdx - now.getDay() + 7) % 7;
  now.setDate(now.getDate() + diff);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateBadge(dateStr: string): { label: string; isSunday: boolean } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return { label: '', isSunday: false };
  const parsed = new Date(`${dateStr}T12:00:00`);
  if (isNaN(parsed.getTime())) return { label: '', isSunday: false };
  const dayName = JOURS_FR[parsed.getDay()];
  const [y, m, d] = dateStr.split('-');
  return {
    label: `${dayName} ${d}/${m}/${y}`,
    isSunday: parsed.getDay() === 0,
  };
}

function formatTableDate(dateStr?: string): string {
  if (!dateStr) return 'Récurrent';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

export default function AdminScheduleManager({ seances, salles, matieres, teachers, groups }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [createForm, setCreateForm] = useState<SeanceFormValues>(() => ({
    date: getTodayValidDateISO(),
    heureDebut: '08:30',
    heureFin: '11:45',
    typeSeance: 'Cours',
    matiere: matieres[0]?._id || '',
    enseignant: teachers[0]?._id || '',
    groupe: groups[0]?._id || '',
    salle: salles[0]?._id || '',
  }));

  const [aiPrompt, setAiPrompt] = useState('');
  const [aiNotice, setAiNotice] = useState<string | null>(null);

  const [popup, setPopup] = useState<PopupState | null>(null);
  const [alternatives, setAlternatives] = useState<ConflictAlternative[]>([]);
  const [alternativesSummary, setAlternativesSummary] = useState<string | null>(null);
  const [loadingAlternatives, setLoadingAlternatives] = useState(false);

  const [editingSeance, setEditingSeance] = useState<SeanceViewItem | null>(null);
  const [editForm, setEditForm] = useState<SeanceFormValues>({
    date: getTodayValidDateISO(),
    heureDebut: '08:30',
    heureFin: '11:45',
    typeSeance: 'Cours',
    matiere: '',
    enseignant: '',
    groupe: '',
    salle: '',
  });

  const [busyAction, setBusyAction] = useState<string | null>(null);

  const createDateInfo = formatDateBadge(createForm.date);
  const editDateInfo = formatDateBadge(editForm.date);

  const closePopup = () => {
    setPopup(null);
    setAlternatives([]);
    setAlternativesSummary(null);
  };

  const showResultPopup = (
    res: { success: boolean; message?: string; error?: string; conflictType?: string },
    successTitle: string,
    conflictContext?: ConflictContext
  ) => {
    setAlternatives([]);
    setAlternativesSummary(null);

    if (res.success) {
      setPopup({
        type: 'success',
        title: successTitle,
        message: res.message || 'Opération effectuée avec succès.',
      });
    } else {
      let errorTitle = 'Enregistrement impossible';
      if (res.conflictType === 'salle') {
        errorTitle = 'Salle déjà réservée';
      } else if (res.conflictType === 'enseignant') {
        errorTitle = 'Conflit d’enseignant';
      } else if (res.conflictType === 'groupe') {
        errorTitle = 'Conflit de groupe';
      }
      setPopup({
        type: 'error',
        title: errorTitle,
        message: res.error || 'Une erreur est survenue.',
        conflictContext: res.conflictType ? conflictContext : undefined,
      });
    }
  };

  async function handleAiParsePrompt(e: React.FormEvent) {
    e.preventDefault();
    if (!aiPrompt.trim()) return;
    setBusyAction('ai-parse');
    setAiNotice(null);
    try {
      const res = await parseSchedulePromptAction(aiPrompt);
      if (res.success && res.data) {
        setCreateForm({
          date: res.data.date,
          heureDebut: res.data.heureDebut,
          heureFin: res.data.heureFin,
          typeSeance: res.data.typeSeance,
          matiere: res.data.matiereId || createForm.matiere,
          enseignant: res.data.enseignantId || createForm.enseignant,
          groupe: res.data.groupeId || createForm.groupe,
          salle: res.data.salleId || createForm.salle,
        });
        setAiNotice(`${res.data.explanation} Vérifiez les champs puis cliquez sur « Vérifier conflits & Enregistrer ».`);
      } else {
        setPopup({
          type: 'error',
          title: 'Analyse IA impossible',
          message: res.error || 'Impossible d’interpréter cette phrase.',
        });
      }
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSuggestAlternatives() {
    if (!popup?.conflictContext) return;
    setLoadingAlternatives(true);
    try {
      const res = await suggestScheduleAlternativesAction(popup.conflictContext);
      if (res.success) {
        setAlternatives(res.alternatives);
        setAlternativesSummary(res.summary || null);
      } else {
        setAlternativesSummary(res.error || 'Impossible de calculer des alternatives.');
      }
    } finally {
      setLoadingAlternatives(false);
    }
  }

  function handleApplyAlternative(alt: ConflictAlternative) {
    const mode = popup?.conflictContext?.mode;
    if (mode === 'edit') {
      setEditForm((prev) => ({
        ...prev,
        date: alt.date,
        heureDebut: alt.heureDebut,
        heureFin: alt.heureFin,
        salle: alt.salleId,
      }));
    } else {
      setCreateForm((prev) => ({
        ...prev,
        date: alt.date,
        heureDebut: alt.heureDebut,
        heureFin: alt.heureFin,
        salle: alt.salleId,
      }));
      setAiNotice(`Alternative IA appliquée : ${alt.label}. Cliquez sur « Vérifier conflits & Enregistrer » pour valider.`);
    }
    closePopup();
  }

  async function handleCreateSalle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    setBusyAction('create-salle');
    try {
      const res = await createSalleAction(formData);
      showResultPopup(res, 'Salle ajoutée');
      if (res.success) {
        form.reset();
        startTransition(() => router.refresh());
      }
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDeleteSalle(id: string) {
    const formData = new FormData();
    formData.append('id', id);
    setBusyAction(`delete-salle-${id}`);
    try {
      const res = await deleteSalleAction(formData);
      showResultPopup(res, 'Salle supprimée');
      if (res.success) {
        startTransition(() => router.refresh());
      }
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCreateSeance(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData();
    formData.set('date', createForm.date);
    formData.set('heureDebut', createForm.heureDebut);
    formData.set('heureFin', createForm.heureFin);
    formData.set('typeSeance', createForm.typeSeance);
    formData.set('matiere', createForm.matiere);
    formData.set('enseignant', createForm.enseignant);
    formData.set('groupe', createForm.groupe);
    formData.set('salle', createForm.salle);

    setBusyAction('create-seance');
    try {
      const res = await createSeanceAction(formData);
      showResultPopup(res, 'Séance planifiée et enregistrée !', {
        mode: 'create',
        date: createForm.date,
        heureDebut: createForm.heureDebut,
        heureFin: createForm.heureFin,
        enseignantId: createForm.enseignant,
        groupeId: createForm.groupe,
        salleId: createForm.salle,
        conflictType: res.conflictType as ConflictContext['conflictType'],
      });
      if (res.success) {
        setAiNotice(null);
        setAiPrompt('');
        startTransition(() => router.refresh());
      }
    } finally {
      setBusyAction(null);
    }
  }

  function openEditModal(seance: SeanceViewItem) {
    setEditingSeance(seance);
    setEditForm({
      date: seance.date || getNextDateForJour(seance.jour),
      heureDebut: seance.heureDebut,
      heureFin: seance.heureFin,
      typeSeance: seance.typeSeance || 'Cours',
      matiere: seance.matiere?._id || matieres[0]?._id || '',
      enseignant: seance.enseignant?._id || teachers[0]?._id || '',
      groupe: seance.groupe?._id || groups[0]?._id || '',
      salle: seance.salle?._id || salles[0]?._id || '',
    });
  }

  async function handleUpdateSeance(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingSeance) return;
    const formData = new FormData();
    formData.set('id', editingSeance._id);
    formData.set('date', editForm.date);
    formData.set('heureDebut', editForm.heureDebut);
    formData.set('heureFin', editForm.heureFin);
    formData.set('typeSeance', editForm.typeSeance);
    formData.set('matiere', editForm.matiere);
    formData.set('enseignant', editForm.enseignant);
    formData.set('groupe', editForm.groupe);
    formData.set('salle', editForm.salle);

    setBusyAction('update-seance');
    try {
      const res = await updateSeanceAction(formData);
      if (res.success) {
        setEditingSeance(null);
        startTransition(() => router.refresh());
      }
      showResultPopup(res, 'Séance modifiée avec succès !', {
        mode: 'edit',
        date: editForm.date,
        heureDebut: editForm.heureDebut,
        heureFin: editForm.heureFin,
        enseignantId: editForm.enseignant,
        groupeId: editForm.groupe,
        salleId: editForm.salle,
        conflictType: res.conflictType as ConflictContext['conflictType'],
        excludeId: editingSeance._id,
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDeleteSeance(id: string) {
    const formData = new FormData();
    formData.append('id', id);
    setBusyAction(`delete-seance-${id}`);
    try {
      const res = await deleteSeanceAction(formData);
      showResultPopup(res, 'Séance supprimée');
      if (res.success) {
        startTransition(() => router.refresh());
      }
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-slate-800">Emploi du Temps & Salles</h1>
        <p className="text-xs sm:text-sm text-slate-500">
          Agenda par date avec contrôle algorithmique des conflits et assistant IA intégré.
        </p>
      </div>

      {/* 1. GESTION DES SALLES */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Building className="w-5 h-5 text-amber-500" />
          <h2 className="text-sm sm:text-base font-bold text-slate-800">
            1. Salles de Cours & Laboratoires ({salles.length})
          </h2>
        </div>

        <form onSubmit={handleCreateSalle} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nom / Numéro de salle *</label>
            <input
              type="text"
              name="nom"
              required
              placeholder="Ex : Labo Info 302"
              className="w-full text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#03c9d7]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Capacité (places) *</label>
            <input
              type="number"
              name="capacite"
              required
              min="1"
              defaultValue="30"
              className="w-full text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#03c9d7]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Type de salle</label>
            <select
              name="type"
              className="w-full text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#03c9d7]"
            >
              <option value="Salle de cours">Salle de cours / TD</option>
              <option value="Laboratoire Informatique">Laboratoire Informatique</option>
              <option value="Amphithéâtre">Amphithéâtre</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={busyAction === 'create-salle'}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all bg-[#03c9d7] hover:bg-[#00b5b8] text-white shadow-md shadow-cyan-500/20 disabled:opacity-50"
            >
              {busyAction === 'create-salle' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              <span>Ajouter Salle</span>
            </button>
          </div>
        </form>

        <div className="flex flex-wrap gap-2 pt-2">
          {salles.map((s) => (
            <div
              key={s._id}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs flex items-center gap-3"
            >
              <div>
                <span className="font-bold text-slate-800">{s.nom}</span>
                <span className="text-[11px] text-slate-500 block">
                  {s.capacite} places • {s.type}
                </span>
              </div>
              <button
                type="button"
                disabled={busyAction === `delete-salle-${s._id}`}
                onClick={() => handleDeleteSalle(s._id)}
                className="p-1 text-slate-400 hover:text-rose-600 rounded disabled:opacity-50"
                title="Supprimer la salle"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* 2. PLANIFICATION D'UNE SÉANCE */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Calendar className="w-5 h-5 text-[#03c9d7]" />
          <h2 className="text-sm sm:text-base font-bold text-slate-800">
            2. Programmer une Séance (Vérification Anti-Conflit)
          </h2>
        </div>

        {/* IDÉE 1 : Planification IA en langage naturel */}
        <form
          onSubmit={handleAiParsePrompt}
          className="bg-linear-to-r from-teal-50/80 to-cyan-50/60 border border-[#03c9d7]/30 rounded-xl p-3 sm:p-4 space-y-2"
        >
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
            <Sparkles className="w-4 h-4 text-[#03c9d7]" />
            <span>Assistant IA — Planifier en langage naturel</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Ex : Planifie un TP de NoSQL pour 4ALINFO-GL1 avec Dr. Mehdi Ben Salem lundi prochain de 08h30 à 11h45 en Labo Info 301"
              className="flex-1 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#03c9d7]"
            />
            <button
              type="submit"
              disabled={busyAction === 'ai-parse' || !aiPrompt.trim()}
              className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-50 transition-colors"
            >
              {busyAction === 'ai-parse' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Wand2 className="w-3.5 h-3.5 text-[#03c9d7]" />
              )}
              <span>Remplir avec l’IA</span>
            </button>
          </div>
          {aiNotice && <p className="text-[11px] font-medium text-teal-800">{aiNotice}</p>}
        </form>

        <form onSubmit={handleCreateSeance} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Date de la séance *</label>
            <input
              type="date"
              name="date"
              required
              value={createForm.date}
              onChange={(e) => setCreateForm((p) => ({ ...p, date: e.target.value }))}
              className="w-full text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#03c9d7]"
            />
            {createDateInfo.label && (
              <p
                className={`text-[11px] mt-1 font-medium ${
                  createDateInfo.isSunday ? 'text-rose-600' : 'text-[#03c9d7]'
                }`}
              >
                {createDateInfo.isSunday ? `${createDateInfo.label} (Dimanche non autorisé)` : createDateInfo.label}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Heure de début *</label>
            <input
              type="time"
              name="heureDebut"
              required
              value={createForm.heureDebut}
              onChange={(e) => setCreateForm((p) => ({ ...p, heureDebut: e.target.value }))}
              className="w-full text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#03c9d7]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Heure de fin *</label>
            <input
              type="time"
              name="heureFin"
              required
              value={createForm.heureFin}
              onChange={(e) => setCreateForm((p) => ({ ...p, heureFin: e.target.value }))}
              className="w-full text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#03c9d7]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Type de séance</label>
            <select
              name="typeSeance"
              value={createForm.typeSeance}
              onChange={(e) => setCreateForm((p) => ({ ...p, typeSeance: e.target.value }))}
              className="w-full text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#03c9d7]"
            >
              <option value="Cours">Cours Intégré</option>
              <option value="TD">Travaux Dirigés (TD)</option>
              <option value="TP">Travaux Pratiques (TP)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Matière *</label>
            <select
              name="matiere"
              required
              value={createForm.matiere}
              onChange={(e) => setCreateForm((p) => ({ ...p, matiere: e.target.value }))}
              className="w-full text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#03c9d7]"
            >
              {matieres.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.nom} ({m.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Enseignant *</label>
            <select
              name="enseignant"
              required
              value={createForm.enseignant}
              onChange={(e) => setCreateForm((p) => ({ ...p, enseignant: e.target.value }))}
              className="w-full text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#03c9d7]"
            >
              {teachers.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.nom}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Groupe d’étudiants *</label>
            <select
              name="groupe"
              required
              value={createForm.groupe}
              onChange={(e) => setCreateForm((p) => ({ ...p, groupe: e.target.value }))}
              className="w-full text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#03c9d7]"
            >
              {groups.map((g) => (
                <option key={g._id} value={g._id}>
                  {g.nom}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Salle *</label>
            <select
              name="salle"
              required
              value={createForm.salle}
              onChange={(e) => setCreateForm((p) => ({ ...p, salle: e.target.value }))}
              className="w-full text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#03c9d7]"
            >
              {salles.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.nom} ({s.capacite} places)
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2 lg:col-span-4 flex justify-end pt-2">
            <button
              type="submit"
              disabled={busyAction === 'create-seance' || isPending}
              className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all bg-[#03c9d7] hover:bg-[#00b5b8] text-white shadow-md shadow-cyan-500/20 disabled:opacity-50"
            >
              {busyAction === 'create-seance' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              <span>Vérifier conflits & Enregistrer</span>
            </button>
          </div>
        </form>
      </section>

      {/* 3. VUE DE L'EMPLOI DU TEMPS (AGENDA PAR DATE) */}
      <section className="space-y-4">
        <ScheduleWeeklyView seances={seances} title="Emploi du Temps Général" userRole="admin" />

        {/* CRUD table for saved sessions */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Gestion des Séances Enregistrées ({seances.length})
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px]">
                  <th className="py-2 px-3">Date & Créneau</th>
                  <th className="py-2 px-3">Matière</th>
                  <th className="py-2 px-3">Enseignant</th>
                  <th className="py-2 px-3">Groupe</th>
                  <th className="py-2 px-3">Salle</th>
                  <th className="py-2 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {seances.map((s) => (
                  <tr key={s._id} className="hover:bg-slate-50/50">
                    <td className="py-2 px-3 font-mono font-bold text-[#03c9d7]">
                      <div>
                        {s.jour} • {formatTableDate(s.date)}
                      </div>
                      <div className="text-[11px] text-slate-500 font-normal">
                        {s.heureDebut}-{s.heureFin} ({s.typeSeance || 'Cours'})
                      </div>
                    </td>
                    <td className="py-2 px-3 font-semibold text-slate-800">{s.matiere?.nom}</td>
                    <td className="py-2 px-3 text-slate-600">{s.enseignant?.nom}</td>
                    <td className="py-2 px-3 text-slate-600">{s.groupe?.nom}</td>
                    <td className="py-2 px-3 text-slate-600 font-semibold">{s.salle?.nom}</td>
                    <td className="py-2 px-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(s)}
                          className="p-1.5 text-slate-400 hover:text-[#03c9d7] hover:bg-teal-50 rounded-lg transition-colors"
                          title="Modifier cette séance"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={busyAction === `delete-seance-${s._id}`}
                          onClick={() => handleDeleteSeance(s._id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Supprimer cette séance"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* MODAL MODIFICATION (CRUD) */}
      {editingSeance && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-2xl p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-[#03c9d7]" />
                <h3 className="text-base font-bold text-slate-800">Modifier la séance</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingSeance(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateSeance} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Date de la séance *</label>
                <input
                  type="date"
                  name="date"
                  required
                  value={editForm.date}
                  onChange={(e) => setEditForm((p) => ({ ...p, date: e.target.value }))}
                  className="w-full text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#03c9d7]"
                />
                {editDateInfo.label && (
                  <p
                    className={`text-[11px] mt-1 font-medium ${
                      editDateInfo.isSunday ? 'text-rose-600' : 'text-[#03c9d7]'
                    }`}
                  >
                    {editDateInfo.isSunday ? `${editDateInfo.label} (Dimanche non autorisé)` : editDateInfo.label}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Type de séance</label>
                <select
                  name="typeSeance"
                  value={editForm.typeSeance}
                  onChange={(e) => setEditForm((p) => ({ ...p, typeSeance: e.target.value }))}
                  className="w-full text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#03c9d7]"
                >
                  <option value="Cours">Cours Intégré</option>
                  <option value="TD">Travaux Dirigés (TD)</option>
                  <option value="TP">Travaux Pratiques (TP)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Heure de début *</label>
                <input
                  type="time"
                  name="heureDebut"
                  required
                  value={editForm.heureDebut}
                  onChange={(e) => setEditForm((p) => ({ ...p, heureDebut: e.target.value }))}
                  className="w-full text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#03c9d7]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Heure de fin *</label>
                <input
                  type="time"
                  name="heureFin"
                  required
                  value={editForm.heureFin}
                  onChange={(e) => setEditForm((p) => ({ ...p, heureFin: e.target.value }))}
                  className="w-full text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#03c9d7]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Matière *</label>
                <select
                  name="matiere"
                  required
                  value={editForm.matiere}
                  onChange={(e) => setEditForm((p) => ({ ...p, matiere: e.target.value }))}
                  className="w-full text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#03c9d7]"
                >
                  {matieres.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.nom} ({m.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Enseignant *</label>
                <select
                  name="enseignant"
                  required
                  value={editForm.enseignant}
                  onChange={(e) => setEditForm((p) => ({ ...p, enseignant: e.target.value }))}
                  className="w-full text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#03c9d7]"
                >
                  {teachers.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.nom}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Groupe d’étudiants *</label>
                <select
                  name="groupe"
                  required
                  value={editForm.groupe}
                  onChange={(e) => setEditForm((p) => ({ ...p, groupe: e.target.value }))}
                  className="w-full text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#03c9d7]"
                >
                  {groups.map((g) => (
                    <option key={g._id} value={g._id}>
                      {g.nom}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Salle *</label>
                <select
                  name="salle"
                  required
                  value={editForm.salle}
                  onChange={(e) => setEditForm((p) => ({ ...p, salle: e.target.value }))}
                  className="w-full text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#03c9d7]"
                >
                  {salles.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.nom} ({s.capacite} places)
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2 flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingSeance(null)}
                  className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={busyAction === 'update-seance'}
                  className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-[#03c9d7] hover:bg-[#00b5b8] shadow-md shadow-cyan-500/20 flex items-center gap-2 disabled:opacity-50"
                >
                  {busyAction === 'update-seance' && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Enregistrer les modifications</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POP-UP SUCCÈS / CONFLIT SALLE + RÉSOLUTION IA */}
      {popup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
          role="alertdialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 text-center max-h-[90vh] overflow-y-auto">
            <div
              className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center ${
                popup.type === 'success'
                  ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                  : 'bg-rose-50 text-rose-600 border border-rose-200'
              }`}
            >
              {popup.type === 'success' ? (
                <CheckCircle2 className="w-8 h-8" />
              ) : (
                <AlertTriangle className="w-8 h-8" />
              )}
            </div>

            <div className="space-y-1.5">
              <h3 className="text-lg font-black text-slate-800">{popup.title}</h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{popup.message}</p>
            </div>

            {/* IDÉE 2 : Résolution intelligente des conflits par l'IA */}
            {popup.type === 'error' && popup.conflictContext && (
              <div className="pt-2 space-y-3 text-left">
                {alternatives.length === 0 && !alternativesSummary && (
                  <button
                    type="button"
                    disabled={loadingAlternatives}
                    onClick={handleSuggestAlternatives}
                    className="w-full min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-900 text-white flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    {loadingAlternatives ? (
                      <Loader2 className="w-4 h-4 animate-spin text-[#03c9d7]" />
                    ) : (
                      <Sparkles className="w-4 h-4 text-[#03c9d7]" />
                    )}
                    <span>Proposer une alternative avec l’IA</span>
                  </button>
                )}

                {alternativesSummary && (
                  <div className="bg-teal-50/70 border border-teal-200 rounded-xl p-3 text-xs text-teal-900 font-medium">
                    {alternativesSummary}
                  </div>
                )}

                {alternatives.length > 0 && (
                  <div className="space-y-2">
                    {alternatives.map((alt) => (
                      <div
                        key={alt.id}
                        className="border border-slate-200 rounded-xl p-3 bg-slate-50 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate">{alt.label}</p>
                          <p className="text-[11px] text-slate-500">{alt.reason}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleApplyAlternative(alt)}
                          className="px-3 py-1.5 rounded-lg bg-[#03c9d7] hover:bg-[#00b5b8] text-white text-xs font-semibold shrink-0 flex items-center gap-1"
                        >
                          <span>Appliquer</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={closePopup}
              className={`w-full min-h-[44px] px-4 py-2.5 rounded-xl font-semibold text-sm text-white transition-all ${
                popup.type === 'success'
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/20'
                  : 'bg-rose-600 hover:bg-rose-700 shadow-md shadow-rose-600/20'
              }`}
            >
              {popup.type === 'success' ? 'Parfait' : 'Fermer'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
