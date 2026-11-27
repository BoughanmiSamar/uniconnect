'use server';

import { revalidatePath } from 'next/cache';
import connectToDatabase from '@/lib/mongodb';
import { Seance, JourSemaine } from '@/models/Seance';
import { Salle } from '@/models/Salle';
import { requireAuth } from '@/lib/auth';

/* --- SALLES --- */
export async function createSalleAction(formData: FormData) {
  await requireAuth(['admin']);
  await connectToDatabase();

  const nom = (formData.get('nom') as string)?.trim();
  const capacite = parseInt(formData.get('capacite') as string, 10);
  const type = (formData.get('type') as string)?.trim() || 'Salle de cours';

  if (!nom || isNaN(capacite) || capacite <= 0) {
    return { success: false, error: 'Nom et capacité valide (> 0) sont obligatoires.' };
  }

  const existing = await Salle.findOne({ nom });
  if (existing) {
    return { success: false, error: 'Une salle avec ce nom existe déjà.' };
  }

  await Salle.create({ nom, capacite, type });
  revalidatePath('/admin/schedule');
  return { success: true, message: 'Salle ajoutée avec succès.' };
}

export async function deleteSalleAction(formData: FormData) {
  await requireAuth(['admin']);
  await connectToDatabase();

  const id = formData.get('id') as string;
  const inUse = await Seance.countDocuments({ salle: id });
  if (inUse > 0) {
    return { success: false, error: 'Impossible de supprimer cette salle : des séances y sont planifiées.' };
  }

  await Salle.findByIdAndDelete(id);
  revalidatePath('/admin/schedule');
  return { success: true, message: 'Salle supprimée avec succès.' };
}

/* --- HELPERS SÉANCES --- */
function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

const JOURS_MAP: Record<number, JourSemaine> = {
  1: 'Lundi',
  2: 'Mardi',
  3: 'Mercredi',
  4: 'Jeudi',
  5: 'Vendredi',
  6: 'Samedi',
};

function getJourFromDate(dateStr: string): JourSemaine | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const parsed = new Date(`${dateStr}T12:00:00`);
  if (isNaN(parsed.getTime())) return null;
  return JOURS_MAP[parsed.getDay()] || null;
}

function formatDateFr(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

interface ConflictCheckParams {
  date: string;
  jour: JourSemaine;
  debutMin: number;
  finMin: number;
  salle: string;
  enseignant: string;
  groupe: string;
  excludeId?: string;
}

interface PopulatedNamedRef {
  _id: { toString(): string };
  nom?: string;
}

type TypeSeanceValue = 'Cours' | 'TD' | 'TP';

function normalizeTypeSeance(val: FormDataEntryValue | null): TypeSeanceValue {
  if (val === 'TD' || val === 'TP' || val === 'Cours') return val;
  return 'Cours';
}

async function checkSeanceConflict(params: ConflictCheckParams): Promise<{
  conflictType: 'salle' | 'enseignant' | 'groupe';
  error: string;
} | null> {
  const { date, jour, debutMin, finMin, salle, enseignant, groupe, excludeId } = params;

  const query: Record<string, unknown> = {
    $or: [
      { date },
      { date: { $exists: false }, jour },
      { date: null, jour },
      { date: '', jour },
    ],
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  const existingSeances = await Seance.find(query).populate('salle enseignant groupe matiere');
  const dateLabel = `${jour} ${formatDateFr(date)}`;

  for (const s of existingSeances) {
    const sDebut = timeToMinutes(s.heureDebut);
    const sFin = timeToMinutes(s.heureFin);
    const hasTimeOverlap = debutMin < sFin && finMin > sDebut;

    if (!hasTimeOverlap) continue;

    const salleRef = s.salle as unknown as PopulatedNamedRef | null;
    const matiereRef = s.matiere as unknown as PopulatedNamedRef | null;
    const enseignantRef = s.enseignant as unknown as PopulatedNamedRef | null;
    const groupeRef = s.groupe as unknown as PopulatedNamedRef | null;

    // 1. Conflit de salle
    if (salleRef?._id?.toString() === salle) {
      return {
        conflictType: 'salle',
        error: `La salle "${salleRef.nom || ''}" est déjà réservée le ${dateLabel} de ${s.heureDebut} à ${s.heureFin} pour la matière ${matiereRef?.nom || ''}.`,
      };
    }

    // 2. Conflit d'enseignant
    if (enseignantRef?._id?.toString() === enseignant) {
      return {
        conflictType: 'enseignant',
        error: `L'enseignant ${enseignantRef.nom || ''} a déjà cours le ${dateLabel} de ${s.heureDebut} à ${s.heureFin} avec le groupe ${groupeRef?.nom || ''}.`,
      };
    }

    // 3. Conflit de groupe
    if (groupeRef?._id?.toString() === groupe) {
      return {
        conflictType: 'groupe',
        error: `Le groupe ${groupeRef.nom || ''} a déjà une séance le ${dateLabel} de ${s.heureDebut} à ${s.heureFin} (${matiereRef?.nom || ''}).`,
      };
    }
  }

  return null;
}

/* --- SÉANCES (CRUD + DÉTECTION STRICTE DES CONFLITS) --- */
export async function createSeanceAction(formData: FormData) {
  await requireAuth(['admin']);
  await connectToDatabase();

  const date = (formData.get('date') as string)?.trim();
  const heureDebut = (formData.get('heureDebut') as string)?.trim();
  const heureFin = (formData.get('heureFin') as string)?.trim();
  const matiere = formData.get('matiere') as string;
  const enseignant = formData.get('enseignant') as string;
  const groupe = formData.get('groupe') as string;
  const salle = formData.get('salle') as string;
  const typeSeance = (formData.get('typeSeance') as string) || 'Cours';

  if (!date || !heureDebut || !heureFin || !matiere || !enseignant || !groupe || !salle) {
    return { success: false, error: 'Tous les champs de la séance sont requis.' };
  }

  const jour = getJourFromDate(date);
  if (!jour) {
    return {
      success: false,
      error: 'Date invalide : les séances doivent être planifiées du Lundi au Samedi (hors Dimanche).',
    };
  }

  const debutMin = timeToMinutes(heureDebut);
  const finMin = timeToMinutes(heureFin);

  if (finMin <= debutMin) {
    return {
      success: false,
      error: "Règle de gestion : L'heure de fin doit être strictement postérieure à l'heure de début.",
    };
  }

  const conflict = await checkSeanceConflict({
    date,
    jour,
    debutMin,
    finMin,
    salle,
    enseignant,
    groupe,
  });

  if (conflict) {
    return {
      success: false,
      conflictType: conflict.conflictType,
      error: conflict.error,
    };
  }

  await Seance.create({
    date,
    jour,
    heureDebut,
    heureFin,
    matiere,
    enseignant,
    groupe,
    salle,
    typeSeance: normalizeTypeSeance(typeSeance),
  });

  revalidatePath('/admin/schedule');
  revalidatePath('/teacher/schedule');
  revalidatePath('/student/schedule');
  return {
    success: true,
    message: `La séance du ${jour} ${formatDateFr(date)} (${heureDebut} - ${heureFin}) a été planifiée et enregistrée avec succès.`,
  };
}

export async function updateSeanceAction(formData: FormData) {
  await requireAuth(['admin']);
  await connectToDatabase();

  const id = (formData.get('id') as string)?.trim();
  const date = (formData.get('date') as string)?.trim();
  const heureDebut = (formData.get('heureDebut') as string)?.trim();
  const heureFin = (formData.get('heureFin') as string)?.trim();
  const matiere = formData.get('matiere') as string;
  const enseignant = formData.get('enseignant') as string;
  const groupe = formData.get('groupe') as string;
  const salle = formData.get('salle') as string;
  const typeSeance = (formData.get('typeSeance') as string) || 'Cours';

  if (!id || !date || !heureDebut || !heureFin || !matiere || !enseignant || !groupe || !salle) {
    return { success: false, error: 'Tous les champs de la séance sont requis pour la modification.' };
  }

  const jour = getJourFromDate(date);
  if (!jour) {
    return {
      success: false,
      error: 'Date invalide : les séances doivent être planifiées du Lundi au Samedi (hors Dimanche).',
    };
  }

  const debutMin = timeToMinutes(heureDebut);
  const finMin = timeToMinutes(heureFin);

  if (finMin <= debutMin) {
    return {
      success: false,
      error: "Règle de gestion : L'heure de fin doit être strictement postérieure à l'heure de début.",
    };
  }

  const conflict = await checkSeanceConflict({
    date,
    jour,
    debutMin,
    finMin,
    salle,
    enseignant,
    groupe,
    excludeId: id,
  });

  if (conflict) {
    return {
      success: false,
      conflictType: conflict.conflictType,
      error: conflict.error,
    };
  }

  const updated = await Seance.findByIdAndUpdate(
    id,
    {
      date,
      jour,
      heureDebut,
      heureFin,
      matiere,
      enseignant,
      groupe,
      salle,
      typeSeance: normalizeTypeSeance(typeSeance),
    },
    { new: true }
  );

  if (!updated) {
    return { success: false, error: 'Séance introuvable.' };
  }

  revalidatePath('/admin/schedule');
  revalidatePath('/teacher/schedule');
  revalidatePath('/student/schedule');
  return {
    success: true,
    message: `La séance du ${jour} ${formatDateFr(date)} (${heureDebut} - ${heureFin}) a été modifiée et enregistrée avec succès.`,
  };
}

export async function deleteSeanceAction(formData: FormData) {
  await requireAuth(['admin']);
  await connectToDatabase();

  const id = formData.get('id') as string;
  await Seance.findByIdAndDelete(id);

  revalidatePath('/admin/schedule');
  revalidatePath('/teacher/schedule');
  revalidatePath('/student/schedule');
  return { success: true, message: 'Séance supprimée de l’emploi du temps.' };
}
