'use client';

import { useState } from 'react';
import { Eye, X, Download, ExternalLink, FileText, FileImage } from 'lucide-react';

interface FileViewerModalProps {
  fileUrl: string;
  fileName?: string;
  buttonLabel?: string;
  buttonClassName?: string;
}

export default function FileViewerModal({
  fileUrl,
  fileName = 'Pièce jointe',
  buttonLabel = 'Visualiser',
  buttonClassName,
}: FileViewerModalProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Normalize URL
  const normalizedUrl = fileUrl.startsWith('/') || fileUrl.startsWith('blob:') || fileUrl.startsWith('http')
    ? fileUrl
    : `/uploads/justificatifs/${fileUrl}`;

  const isPdf =
    normalizedUrl.toLowerCase().includes('.pdf') ||
    fileName.toLowerCase().endsWith('.pdf');

  const isImage =
    normalizedUrl.toLowerCase().includes('.jpg') ||
    normalizedUrl.toLowerCase().includes('.jpeg') ||
    normalizedUrl.toLowerCase().includes('.png') ||
    normalizedUrl.toLowerCase().includes('.webp') ||
    fileName.toLowerCase().match(/\.(jpg|jpeg|png|webp)$/);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={
          buttonClassName ||
          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-[#03c9d7] border border-teal-200 font-bold text-xs transition-all shadow-2xs hover:shadow-xs active:scale-95'
        }
        title="Ouvrir et visualiser le document"
      >
        <Eye className="w-3.5 h-3.5" />
        <span>{buttonLabel}</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/80">
              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                <div className="w-8 h-8 rounded-xl bg-teal-100 text-[#03c9d7] flex items-center justify-center shrink-0">
                  {isPdf ? <FileText className="w-4 h-4" /> : <FileImage className="w-4 h-4" />}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-800 truncate" title={fileName}>
                    {fileName}
                  </h3>
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">
                    {isPdf ? 'Document PDF' : isImage ? 'Image justificative' : 'Fichier justificatif'}
                  </p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1.5 shrink-0">
                <a
                  href={normalizedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 transition-colors"
                  title="Ouvrir dans un nouvel onglet"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>

                <a
                  href={normalizedUrl}
                  download={fileName}
                  className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 transition-colors"
                  title="Télécharger le fichier"
                >
                  <Download className="w-4 h-4" />
                </a>

                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors ml-1"
                  title="Fermer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Viewer Content */}
            <div className="flex-1 overflow-auto p-3 sm:p-5 bg-slate-100/60 flex items-center justify-center min-h-[350px]">
              {isPdf ? (
                <div className="w-full h-[68vh] rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-xs">
                  <iframe
                    src={normalizedUrl}
                    className="w-full h-full"
                    title={fileName}
                  />
                </div>
              ) : isImage ? (
                <div className="max-h-[68vh] flex items-center justify-center p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={normalizedUrl}
                    alt={fileName}
                    className="max-h-[66vh] max-w-full rounded-2xl object-contain shadow-md border border-slate-200 bg-white"
                  />
                </div>
              ) : (
                <div className="w-full h-[68vh] rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-xs">
                  <iframe
                    src={normalizedUrl}
                    className="w-full h-full"
                    title={fileName}
                  />
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-2.5 border-t border-slate-100 bg-white flex items-center justify-between text-xs text-slate-500">
              <span className="text-[11px]">UniConnect • Visualiseur de pièces jointes</span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-4 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
