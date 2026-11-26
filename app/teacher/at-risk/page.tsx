import connectToDatabase from '@/lib/mongodb';
import { requireAuth } from '@/lib/auth';
import { detectAtRiskStudentsAction } from '@/app/(modules)/ai/actions';
import RiskAnalysisCard from '@/components/modules/RiskAnalysisCard';
import { Sparkles, AlertTriangle, ShieldCheck, Info } from 'lucide-react';



export default async function TeacherAtRiskPage() {
  await requireAuth(['teacher', 'admin']);
  await connectToDatabase();

  const res = await detectAtRiskStudentsAction();
  const students = res.atRiskStudents || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-800">
              Détection des Étudiants à Risque 
            </h1>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-teal-50 text-[#03c9d7] border border-teal-200 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> IA Active
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            Analyse automatisée combinant la trajectoire des notes et le taux d’absentéisme (alerte seuil &gt; 25%).
          </p>
        </div>
      </div>

    

      <RiskAnalysisCard students={students} />
    </div>
  );
}
