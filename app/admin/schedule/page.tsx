import connectToDatabase from '@/lib/mongodb';
import { Seance } from '@/models/Seance';
import { Salle } from '@/models/Salle';
import { Matiere } from '@/models/Matiere';
import { User } from '@/models/User';
import { Group } from '@/models/Group';
import { SeanceViewItem } from '@/components/modules/ScheduleWeeklyView';
import AdminScheduleManager, { SimpleOption } from '@/components/modules/AdminScheduleManager';

interface PopulatedItem {
  _id?: { toString(): string };
  nom?: string;
  code?: string;
  coefficient?: number;
  type?: string;
}

export default async function AdminSchedulePage() {
  await connectToDatabase();

  const [seancesRaw, sallesRaw, matieresRaw, teachersRaw, groupsRaw] = await Promise.all([
    Seance.find()
      .populate('matiere enseignant groupe salle')
      .sort({ date: 1, jour: 1, heureDebut: 1 }),
    Salle.find().sort({ nom: 1 }),
    Matiere.find().sort({ nom: 1 }),
    User.find({ role: 'teacher' }).sort({ nom: 1 }),
    Group.find().sort({ nom: 1 }),
  ]);

  const seances: SeanceViewItem[] = seancesRaw.map((s) => {
    const matiere = s.matiere as unknown as PopulatedItem | null;
    const enseignant = s.enseignant as unknown as PopulatedItem | null;
    const groupe = s.groupe as unknown as PopulatedItem | null;
    const salle = s.salle as unknown as PopulatedItem | null;
    return {
      _id: s._id.toString(),
      date: s.date || undefined,
      jour: s.jour,
      heureDebut: s.heureDebut,
      heureFin: s.heureFin,
      typeSeance: s.typeSeance,
      matiere: {
        _id: matiere?._id?.toString() || '',
        nom: matiere?.nom || 'Matière',
        code: matiere?.code || '',
        coefficient: matiere?.coefficient,
      },
      enseignant: {
        _id: enseignant?._id?.toString() || '',
        nom: enseignant?.nom || 'Enseignant',
      },
      groupe: {
        _id: groupe?._id?.toString() || '',
        nom: groupe?.nom || 'Groupe',
      },
      salle: {
        _id: salle?._id?.toString() || '',
        nom: salle?.nom || 'Salle',
        type: salle?.type,
      },
    };
  });

  const salles: SimpleOption[] = sallesRaw.map((s) => ({
    _id: s._id.toString(),
    nom: s.nom,
    capacite: s.capacite,
    type: s.type,
  }));

  const matieres: SimpleOption[] = matieresRaw.map((m) => ({
    _id: m._id.toString(),
    nom: m.nom,
    code: m.code,
  }));

  const teachers: SimpleOption[] = teachersRaw.map((t) => ({
    _id: t._id.toString(),
    nom: t.nom,
  }));

  const groups: SimpleOption[] = groupsRaw.map((g) => ({
    _id: g._id.toString(),
    nom: g.nom,
  }));

  return (
    <AdminScheduleManager
      seances={seances}
      salles={salles}
      matieres={matieres}
      teachers={teachers}
      groups={groups}
    />
  );
}
