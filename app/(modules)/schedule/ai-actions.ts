'use server';

import { generateObject, generateText, tool } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { z } from 'zod';
import connectToDatabase from '@/lib/mongodb';
import { requireAuth } from '@/lib/auth';
import { Seance, JourSemaine } from '@/models/Seance';
import { Salle } from '@/models/Salle';
import { Matiere } from '@/models/Matiere';
import { User } from '@/models/User';
import { Group } from '@/models/Group';

const JOURS_MAP: Record<number, JourSemaine> = {
  1: 'Lundi',
  2: 'Mardi',
  3: 'Mercredi',
  4: 'Jeudi',
  5: 'Vendredi',
  6: 'Samedi',
};

const MOIS_FR: Record<string, number> = {
  janvier: 1,
  janv: 1,
  fevrier: 2,
  fev: 2,
  mars: 3,
  avril: 4,
  avr: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  juil: 7,
  aout: 8,
  septembre: 9,
  sept: 9,
  octobre: 10,
  oct: 10,
  novembre: 11,
  nov: 11,
  decembre: 12,
  dec: 12,
};

function normalizeText(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getJourFromDate(dateStr: string): JourSemaine | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const parsed = new Date(`${dateStr}T12:00:00`);
  if (isNaN(parsed.getTime())) return null;
  return JOURS_MAP[parsed.getDay()] || null;
}

function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function hasValidGeminiKey(): string | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.startsWith('gen-lang-client')) return null;
  return apiKey;
}

/* ============================================================================
 * IDÉE 1 : Planification en langage naturel (Vercel AI SDK generateObject + Zod)
 * ============================================================================ */

export interface ParsedScheduleResult {
  success: boolean;
  usedLLM?: boolean;
  data?: {
    date: string;
    heureDebut: string;
    heureFin: string;
    typeSeance: 'Cours' | 'TD' | 'TP';
    matiereId: string;
    enseignantId: string;
    groupeId: string;
    salleId: string;
    explanation: string;
  };
  error?: string;
}

function findBestMatch<T extends { _id: string; nom: string; code?: string }>(
  textNorm: string,
  items: T[]
): T | undefined {
  let best: T | undefined;
  let bestScore = 0;

  for (const item of items) {
    const nomNorm = normalizeText(item.nom);
    const codeNorm = item.code ? normalizeText(item.code) : '';

    if (codeNorm && textNorm.includes(codeNorm)) {
      return item;
    }
    if (textNorm.includes(nomNorm)) {
      const score = nomNorm.length + 100;
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
      continue;
    }

    const tokens = nomNorm.split(/[\s\-_/()]+/).filter((t) => t.length >= 3);
    let hits = 0;
    for (const tok of tokens) {
      if (textNorm.includes(tok)) hits += tok.length;
    }
    if (hits > bestScore) {
      bestScore = hits;
      best = item;
    }
  }

  return best;
}

function fallbackParseSchedulePrompt(
  prompt: string,
  catalog: {
    matieres: { _id: string; nom: string; code: string }[];
    teachers: { _id: string; nom: string }[];
    groups: { _id: string; nom: string }[];
    salles: { _id: string; nom: string }[];
  }
): ParsedScheduleResult['data'] {
  const norm = normalizeText(prompt);
  const now = new Date();
  let targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);

  // 1. Date parsing
  const isoMatch = norm.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  const dmyMatch = norm.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  const monthTextMatch = norm.match(
    /\b(\d{1,2})\s+(janvier|janv|fevrier|fev|mars|avril|avr|mai|juin|juillet|juil|aout|septembre|sept|octobre|oct|novembre|nov|decembre|dec)(?:\s+(\d{4}))?\b/
  );

  if (isoMatch) {
    targetDate = new Date(`${isoMatch[1]}T12:00:00`);
  } else if (dmyMatch) {
    const d = parseInt(dmyMatch[1], 10);
    const m = parseInt(dmyMatch[2], 10) - 1;
    const y = dmyMatch[3]
      ? dmyMatch[3].length === 2
        ? 2000 + parseInt(dmyMatch[3], 10)
        : parseInt(dmyMatch[3], 10)
      : now.getFullYear();
    targetDate = new Date(y, m, d, 12, 0, 0);
  } else if (monthTextMatch) {
    const d = parseInt(monthTextMatch[1], 10);
    const m = (MOIS_FR[monthTextMatch[2]] || 1) - 1;
    const y = monthTextMatch[3] ? parseInt(monthTextMatch[3], 10) : now.getFullYear();
    targetDate = new Date(y, m, d, 12, 0, 0);
  } else if (norm.includes('demain')) {
    targetDate.setDate(targetDate.getDate() + 1);
  } else {
    const dayKeywords: { key: string; day: number }[] = [
      { key: 'lundi', day: 1 },
      { key: 'mardi', day: 2 },
      { key: 'mercredi', day: 3 },
      { key: 'jeudi', day: 4 },
      { key: 'vendredi', day: 5 },
      { key: 'samedi', day: 6 },
    ];
    for (const dk of dayKeywords) {
      if (norm.includes(dk.key)) {
        const diff = (dk.day - targetDate.getDay() + 7) % 7;
        targetDate.setDate(targetDate.getDate() + (diff === 0 && norm.includes('prochain') ? 7 : diff));
        break;
      }
    }
  }

  if (targetDate.getDay() === 0) {
    targetDate.setDate(targetDate.getDate() + 1);
  }

  // 2. Time parsing (e.g. 08h30, 8:30, 14h, etc.)
  const timeMatches = [...norm.matchAll(/\b(\d{1,2})\s*[h:]\s*(\d{2})?\b/g)];
  let heureDebut = '08:30';
  let heureFin = '11:45';
  if (timeMatches.length >= 2) {
    const h1 = String(Math.min(23, parseInt(timeMatches[0][1], 10))).padStart(2, '0');
    const m1 = String(timeMatches[0][2] ? parseInt(timeMatches[0][2], 10) : 0).padStart(2, '0');
    const h2 = String(Math.min(23, parseInt(timeMatches[1][1], 10))).padStart(2, '0');
    const m2 = String(timeMatches[1][2] ? parseInt(timeMatches[1][2], 10) : 0).padStart(2, '0');
    heureDebut = `${h1}:${m1}`;
    heureFin = `${h2}:${m2}`;
  } else if (timeMatches.length === 1) {
    const h1 = Math.min(20, parseInt(timeMatches[0][1], 10));
    const m1 = timeMatches[0][2] ? parseInt(timeMatches[0][2], 10) : 0;
    heureDebut = `${String(h1).padStart(2, '0')}:${String(m1).padStart(2, '0')}`;
    heureFin = minutesToTime(h1 * 60 + m1 + 120);
  }

  // 3. Type de séance
  let typeSeance: 'Cours' | 'TD' | 'TP' = 'Cours';
  if (/\btp\b|pratique/.test(norm)) typeSeance = 'TP';
  else if (/\btd\b|dirige/.test(norm)) typeSeance = 'TD';

  // 4. Entities
  const matiere = findBestMatch(norm, catalog.matieres) || catalog.matieres[0];
  const enseignant = findBestMatch(norm, catalog.teachers) || catalog.teachers[0];
  const groupe = findBestMatch(norm, catalog.groups) || catalog.groups[0];
  const salle = findBestMatch(norm, catalog.salles) || catalog.salles[0];

  return {
    date: toISODate(targetDate),
    heureDebut,
    heureFin,
    typeSeance,
    matiereId: matiere?._id || '',
    enseignantId: enseignant?._id || '',
    groupeId: groupe?._id || '',
    salleId: salle?._id || '',
    explanation: `Séance analysée automatiquement (${typeSeance} de ${matiere?.nom || 'Matière'} en ${salle?.nom || 'Salle'}).`,
  };
}

export async function parseSchedulePromptAction(prompt: string): Promise<ParsedScheduleResult> {
  await requireAuth(['admin']);
  await connectToDatabase();

  const cleanPrompt = prompt.trim();
  if (!cleanPrompt) {
    return { success: false, error: 'Veuillez saisir une description de séance à planifier.' };
  }

  const [matieresRaw, teachersRaw, groupsRaw, sallesRaw] = await Promise.all([
    Matiere.find().sort({ nom: 1 }),
    User.find({ role: 'teacher' }).sort({ nom: 1 }),
    Group.find().sort({ nom: 1 }),
    Salle.find().sort({ nom: 1 }),
  ]);

  const catalog = {
    matieres: matieresRaw.map((m) => ({ _id: m._id.toString(), nom: m.nom, code: m.code })),
    teachers: teachersRaw.map((t) => ({ _id: t._id.toString(), nom: t.nom })),
    groups: groupsRaw.map((g) => ({ _id: g._id.toString(), nom: g.nom })),
    salles: sallesRaw.map((s) => ({ _id: s._id.toString(), nom: s.nom })),
  };

  const apiKey = hasValidGeminiKey();
  if (apiKey) {
    try {
      const google = createGoogleGenerativeAI({ apiKey });
      const todayISO = toISODate(new Date());

      const ScheduleSchema = z.object({
        date: z.string().describe('Date exacte au format YYYY-MM-DD (du Lundi au Samedi)'),
        heureDebut: z.string().describe('Heure de début au format HH:mm'),
        heureFin: z.string().describe('Heure de fin au format HH:mm'),
        typeSeance: z.enum(['Cours', 'TD', 'TP']),
        matiereId: z.string().describe('ID exact de la matière correspondante'),
        enseignantId: z.string().describe('ID exact de l’enseignant correspondant'),
        groupeId: z.string().describe('ID exact du groupe correspondant'),
        salleId: z.string().describe('ID exact de la salle correspondante'),
        explanation: z.string().describe('Court résumé en français de la séance extraite'),
      });

      const { object } = await generateObject({
        model: google('gemini-2.5-flash'),
        schema: ScheduleSchema,
        prompt: `Tu es un assistant de planification universitaire. Date d'aujourd'hui: ${todayISO}.
Extrais les informations de séance depuis la phrase suivante: "${cleanPrompt}".

Catalogue disponible (utilise STRICTEMENT les _id fournis) :
- Matières: ${JSON.stringify(catalog.matieres)}
- Enseignants: ${JSON.stringify(catalog.teachers)}
- Groupes: ${JSON.stringify(catalog.groups)}
- Salles: ${JSON.stringify(catalog.salles)}`,
      });

      return {
        success: true,
        usedLLM: true,
        data: object,
      };
    } catch (err) {
      console.warn('[AI Schedule] generateObject fallback:', err);
    }
  }

  // Fallback local déterministe
  return {
    success: true,
    usedLLM: false,
    data: fallbackParseSchedulePrompt(cleanPrompt, catalog),
  };
}

/* ============================================================================
 * IDÉE 2 : Résolution intelligente des conflits (Tool Calling + Alternatives)
 * ============================================================================ */

export interface ConflictAlternative {
  id: string;
  label: string;
  reason: string;
  date: string;
  heureDebut: string;
  heureFin: string;
  salleId: string;
  salleNom: string;
}

export interface SuggestAlternativesResult {
  success: boolean;
  usedLLM?: boolean;
  summary?: string;
  alternatives: ConflictAlternative[];
  error?: string;
}

interface PopulatedIds {
  _id?: { toString(): string };
  nom?: string;
}

export async function suggestScheduleAlternativesAction(params: {
  date: string;
  heureDebut: string;
  heureFin: string;
  enseignantId: string;
  groupeId: string;
  salleId: string;
  conflictType?: 'salle' | 'enseignant' | 'groupe';
  excludeId?: string;
}): Promise<SuggestAlternativesResult> {
  await requireAuth(['admin']);
  await connectToDatabase();

  const { date, heureDebut, heureFin, enseignantId, groupeId, salleId, conflictType, excludeId } = params;
  const jour = getJourFromDate(date);
  if (!jour) {
    return { success: false, alternatives: [], error: 'Date invalide pour la recherche d’alternatives.' };
  }

  const debutMin = timeToMinutes(heureDebut);
  const finMin = timeToMinutes(heureFin);
  const duration = Math.max(60, finMin - debutMin);

  const [allSalles, allSeancesRaw] = await Promise.all([
    Salle.find().sort({ capacite: 1, nom: 1 }),
    Seance.find(excludeId ? { _id: { $ne: excludeId } } : {}).populate('salle enseignant groupe'),
  ]);

  const isSlotFree = (
    checkDate: string,
    checkJour: JourSemaine,
    startM: number,
    endM: number,
    checkSalleId: string
  ): boolean => {
    for (const s of allSeancesRaw) {
      const sameDay = s.date ? s.date === checkDate : s.jour === checkJour;
      if (!sameDay) continue;

      const sDebut = timeToMinutes(s.heureDebut);
      const sFin = timeToMinutes(s.heureFin);
      if (!(startM < sFin && endM > sDebut)) continue;

      const sSalleId = (s.salle as unknown as PopulatedIds | null)?._id?.toString();
      const sTeacherId = (s.enseignant as unknown as PopulatedIds | null)?._id?.toString();
      const sGroupId = (s.groupe as unknown as PopulatedIds | null)?._id?.toString();

      if (sSalleId === checkSalleId || sTeacherId === enseignantId || sGroupId === groupeId) {
        return false;
      }
    }
    return true;
  };

  const candidates: ConflictAlternative[] = [];
  const requestedSalle = allSalles.find((s) => s._id.toString() === salleId);

  // 1. Autres salles libres au même créneau
  if (!conflictType || conflictType === 'salle') {
    for (const s of allSalles) {
      const sid = s._id.toString();
      if (sid === salleId) continue;
      if (isSlotFree(date, jour, debutMin, finMin, sid)) {
        candidates.push({
          id: `room-${sid}`,
          label: `Salle ${s.nom} (${s.capacite} places) • Même créneau`,
          reason: `Disponible le ${jour} ${date} de ${heureDebut} à ${heureFin}.`,
          date,
          heureDebut,
          heureFin,
          salleId: sid,
          salleNom: s.nom,
        });
        if (candidates.length >= 2) break;
      }
    }
  }

  // 2. Autres créneaux libres le même jour (dans la même salle si possible)
  const standardStarts = ['08:30', '10:15', '13:30', '15:15'];
  for (const st of standardStarts) {
    const startM = timeToMinutes(st);
    const endM = startM + duration;
    if (endM > 19 * 60) continue;
    const endStr = minutesToTime(endM);
    if (st === heureDebut && endStr === heureFin) continue;

    if (isSlotFree(date, jour, startM, endM, salleId)) {
      candidates.push({
        id: `slot-${st}`,
        label: `Créneau ${st} - ${endStr} • Salle ${requestedSalle?.nom || 'demandée'}`,
        reason: `La salle, l'enseignant et le groupe sont tous libres le ${jour} ${date}.`,
        date,
        heureDebut: st,
        heureFin: endStr,
        salleId,
        salleNom: requestedSalle?.nom || 'Salle',
      });
      if (candidates.length >= 4) break;
    }
  }

  // 3. Même créneau sur les prochains jours ouvrables (Lundi-Samedi)
  const baseDate = new Date(`${date}T12:00:00`);
  for (let offset = 1; offset <= 6 && candidates.length < 5; offset++) {
    const nextD = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + offset, 12, 0, 0);
    const nextJour = JOURS_MAP[nextD.getDay()];
    if (!nextJour) continue;
    const nextISO = toISODate(nextD);

    if (isSlotFree(nextISO, nextJour, debutMin, finMin, salleId)) {
      candidates.push({
        id: `day-${nextISO}`,
        label: `${nextJour} ${nextISO.split('-').reverse().join('/')} (${heureDebut}-${heureFin})`,
        reason: `Même salle (${requestedSalle?.nom || ''}) et même horaire disponibles ce jour-là.`,
        date: nextISO,
        heureDebut,
        heureFin,
        salleId,
        salleNom: requestedSalle?.nom || 'Salle',
      });
    }
  }

  const topAlternatives = candidates.slice(0, 3);
  let summary =
    topAlternatives.length > 0
      ? `${topAlternatives.length} alternative(s) sans conflit trouvée(s) dans l'agenda.`
      : 'Aucune alternative immédiate trouvée pour ce créneau.';

  // Enrichissement par Vercel AI SDK Tool Calling si GEMINI_API_KEY est configurée
  const apiKey = hasValidGeminiKey();
  if (apiKey && topAlternatives.length > 0) {
    try {
      const google = createGoogleGenerativeAI({ apiKey });
      const { text } = await generateText({
        model: google('gemini-2.5-flash'),
        tools: {
          inspectAlternatives: tool({
            description: 'Récupère les créneaux alternatifs sans conflit calculés depuis la base MongoDB',
            inputSchema: z.object({}),
            execute: async () => topAlternatives,
          }),
        },
        prompt: `Un conflit de planning (${conflictType || 'horaire'}) empêche d'enregistrer une séance le ${jour} ${date} de ${heureDebut} à ${heureFin}.
Appelle l'outil inspectAlternatives et rédige une seule phrase courte et claire en français recommandant la meilleure option parmi celles retournées.`,
      });
      if (text && text.trim()) {
        summary = text.trim();
      }
      return {
        success: true,
        usedLLM: true,
        summary,
        alternatives: topAlternatives,
      };
    } catch (err) {
      console.warn('[AI Schedule] tool calling fallback:', err);
    }
  }

  return {
    success: true,
    usedLLM: false,
    summary,
    alternatives: topAlternatives,
  };
}
