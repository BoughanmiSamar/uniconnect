'use client';

import { useState, useTransition } from 'react';
import { Pencil, X, Check, Loader2, Key, Mail, User, Phone, Layers, Shield } from 'lucide-react';
import { updateUserAction } from '@/app/(modules)/users/actions';

interface EditUserModalProps {
  user: {
    _id: string;
    nom: string;
    email: string;
    role: string;
    groupe?: any;
    telephone?: string;
  };
  groups: {
    _id: string;
    nom: string;
  }[];
}

export default function EditUserModal({ user, groups }: EditUserModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState(user.role);

  const initialGroupId = user.groupe
    ? typeof user.groupe === 'object'
      ? user.groupe._id?.toString() || ''
      : user.groupe.toString()
    : '';

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await updateUserAction(formData);
      if (res && !res.success) {
        setErrorMsg(res.error || 'Erreur lors de la mise à jour.');
      } else {
        setIsOpen(false);
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setSelectedRole(user.role);
          setErrorMsg(null);
          setIsOpen(true);
        }}
        className="p-1.5 text-slate-400 hover:text-[#03c9d7] hover:bg-teal-50 rounded-lg transition-colors inline-flex items-center gap-1 text-xs font-semibold"
        title="Modifier cet utilisateur"
      >
        <Pencil className="w-4 h-4" />
        <span className="md:hidden">Modifier</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden p-6 space-y-5 animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-[#03c9d7]">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">Modifier l’utilisateur</h3>
                  <p className="text-xs text-slate-400">{user.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold">
                {errorMsg}
              </div>
            )}

            {/* Edit Form */}
            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <input type="hidden" name="id" value={user._id} />

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nom complet *</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    name="nom"
                    required
                    defaultValue={user.nom}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#03c9d7]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Email universitaire *</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    name="email"
                    required
                    defaultValue={user.email}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#03c9d7]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Rôle *</label>
                  <select
                    name="role"
                    required
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#03c9d7]"
                  >
                    <option value="student">Étudiant</option>
                    <option value="teacher">Enseignant</option>
                    <option value="admin">Administrateur</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Groupe (si étudiant)</label>
                  <select
                    name="groupe"
                    defaultValue={initialGroupId}
                    disabled={selectedRole !== 'student'}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#03c9d7] disabled:opacity-50"
                  >
                    <option value="">-- Aucun groupe --</option>
                    {groups.map((g) => (
                      <option key={g._id} value={g._id}>
                        {g.nom}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Téléphone</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    name="telephone"
                    defaultValue={user.telephone || ''}
                    placeholder="+216 55 123 456"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#03c9d7]"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <label className="block font-semibold text-slate-700 mb-1">
                  Nouveau mot de passe <span className="text-slate-400 font-normal">(laisser vide pour ne pas modifier)</span>
                </label>
                <div className="relative">
                  <Key className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    name="password"
                    placeholder="Laisser vide pour conserver"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#03c9d7]"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-4">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  disabled={isPending}
                  className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="min-h-[40px] px-5 py-2 rounded-xl bg-[#03c9d7] hover:bg-[#02b3bf] text-white font-bold transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Enregistrement...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Enregistrer</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
