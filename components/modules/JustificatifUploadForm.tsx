'use client';

import { useState, useRef, useTransition } from 'react';
import { Upload, Send, FileText, FileImage, X, Eye, CheckCircle2, AlertCircle } from 'lucide-react';
import { submitJustificatifAction } from '@/app/(modules)/absences/actions';
import FileViewerModal from './FileViewerModal';

interface JustificatifUploadFormProps {
  unjustifiedAbsences: {
    _id: string;
    date: string;
    matiere: string;
    statut: string;
  }[];
}

export default function JustificatifUploadForm({ unjustifiedAbsences }: JustificatifUploadFormProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    const file = e.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      return;
    }

    // Max 15MB
    if (file.size > 15 * 1024 * 1024) {
      setErrorMsg('Le fichier dépasse la taille maximale autorisée (15 Mo).');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const objectUrl = URL.createObjectURL(file);
    setSelectedFile(file);
    setPreviewUrl(objectUrl);
  };

  const handleRemoveFile = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
  };

  const isImage = selectedFile?.type.startsWith('image/');
  const isPdf = selectedFile?.type === 'application/pdf' || selectedFile?.name.toLowerCase().endsWith('.pdf');

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMsg('Veuillez joindre une pièce justificative (PDF ou Image).');
      return;
    }

    const formData = new FormData(e.currentTarget);
    setErrorMsg(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const res = await submitJustificatifAction(formData);
      if (res && !res.success) {
        setErrorMsg(res.error || 'Erreur lors de la soumission du justificatif.');
      } else {
        setSuccessMsg(res.message || 'Justificatif transmis avec succès !');
        handleRemoveFile();
        if (formRef.current) formRef.current.reset();
      }
    });
  };

  if (unjustifiedAbsences.length === 0) {
    return (
      <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl text-center space-y-1">
        <p className="text-sm font-semibold text-slate-700">
          ✅ Aucune absence non justifiée
        </p>
        <p className="text-xs text-slate-400">
          Vous êtes parfaitement en règle, aucune démarche requise pour le moment.
        </p>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Sélecteur de séance */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Séance à justifier *
          </label>
          <select
            name="absenceId"
            required
            className="w-full text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#03c9d7]"
          >
            {unjustifiedAbsences.map((a) => (
              <option key={a._id} value={a._id}>
                {new Date(a.date).toLocaleDateString('fr-FR')} : {a.matiere} ({a.statut})
              </option>
            ))}
          </select>
        </div>

        {/* Input Fichier */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Pièce jointe (Fichier PDF, Image JPG / PNG) *
          </label>
          <input
            ref={fileInputRef}
            type="file"
            name="fichier"
            accept="application/pdf,image/*"
            required
            onChange={handleFileChange}
            className="w-full text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 file:mr-3 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-teal-50 file:text-[#03c9d7] hover:file:bg-teal-100 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#03c9d7]"
          />
        </div>
      </div>

      {/* ZONE D'APERÇU IMMÉDIAT DU FICHIER AJOUTÉ */}
      {selectedFile && previewUrl && (
        <div className="p-3.5 bg-gradient-to-r from-teal-50/70 via-cyan-50/40 to-slate-50 border border-teal-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-teal-100 text-[#03c9d7] flex items-center justify-center shrink-0 border border-teal-200 shadow-2xs">
              {isPdf ? <FileText className="w-5 h-5" /> : <FileImage className="w-5 h-5" />}
            </div>

            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs text-slate-800 truncate" title={selectedFile.name}>
                  {selectedFile.name}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-teal-100 text-teal-800 shrink-0">
                  {isPdf ? 'PDF' : isImage ? 'Image' : 'Fichier'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Taille : {formatFileSize(selectedFile.size)} • Prêt pour l’envoi
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            {/* BOUTON DE PRÉVISUALISATION DIRECTE */}
            <FileViewerModal
              fileUrl={previewUrl}
              fileName={selectedFile.name}
              buttonLabel="Visualiser le fichier sélectionné"
              buttonClassName="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#03c9d7] hover:bg-[#02b3bf] text-white font-bold text-xs transition-all shadow-xs active:scale-95 cursor-pointer"
            />

            <button
              type="button"
              onClick={handleRemoveFile}
              className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 transition-colors"
              title="Supprimer ce fichier"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Motif */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          Motif d&apos;absence détaillé *
        </label>
        <textarea
          name="motif"
          required
          rows={2}
          placeholder="Expliquez la raison médicale ou de force majeure..."
          className="w-full text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#03c9d7]"
        />
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#03c9d7] hover:bg-[#02b3bf] text-white font-bold text-xs sm:text-sm transition-all shadow-sm shadow-[#03c9d7]/20 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95"
        >
          {isPending ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Transmission en cours...</span>
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              <span>Transmettre à l&apos;enseignant</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
