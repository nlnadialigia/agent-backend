import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { CheckCircle2, XCircle, ShieldCheck, Sparkles, Loader2, MessageSquarePlus } from 'lucide-react';
import { Button } from './ui/button';

interface DiagnosticViewerProps {
  diagnostic: string;
  taskId: string;
  onApprove: (taskId: string) => void;
  onReject: (taskId: string) => void;
  onRefine?: (taskId: string, feedback: string) => Promise<void>;
  disabled?: boolean;
}

export const DiagnosticViewer: React.FC<DiagnosticViewerProps> = ({
  diagnostic,
  taskId,
  onApprove,
  onReject,
  onRefine,
  disabled,
}) => {
  const [feedback, setFeedback] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  const handleRefineSubmit = async () => {
    if (!feedback.trim() || !onRefine || isSubmittingFeedback) return;
    setIsSubmittingFeedback(true);
    try {
      await onRefine(taskId, feedback.trim());
      setFeedback('');
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  return (
    <div className="rounded-xl border border-blue-500/40 bg-slate-900/95 shadow-2xl p-6 backdrop-blur flex flex-col space-y-5 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-800 gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-blue-500/20 text-blue-400 rounded-lg shadow-inner">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white">
                Portão de Aprovação (Human-in-the-Loop)
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                Aguardando Decisão
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Revise o blueprint técnico. Você pode solicitar alterações e refinar a proposta antes de autorizar alterações no repositório.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-3 self-end md:self-auto">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onReject(taskId)}
            disabled={disabled || isSubmittingFeedback}
            className="flex items-center gap-1.5"
          >
            <XCircle className="w-4 h-4" />
            Rejeitar / Cancelar
          </Button>

          <Button
            variant="success"
            size="sm"
            onClick={() => onApprove(taskId)}
            disabled={disabled || isSubmittingFeedback}
            className="flex items-center gap-1.5 font-semibold shadow-lg shadow-emerald-900/40 bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            <CheckCircle2 className="w-4 h-4" />
            Aprovar Implementação & PR
          </Button>
        </div>
      </div>

      {/* Markdown Content com layout demarcado */}
      <div className="max-h-[460px] overflow-y-auto pr-3 pl-1 space-y-4">
        <div className="p-5 rounded-lg bg-slate-950/80 border border-slate-800/80 shadow-inner prose prose-invert prose-sm max-w-none prose-headings:border-b prose-headings:border-slate-800 prose-headings:pb-2 prose-headings:text-blue-300 prose-h1:text-xl prose-h2:text-base prose-h3:text-sm prose-p:text-slate-300 prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-700/60 prose-li:text-slate-300 leading-relaxed">
          <ReactMarkdown>{diagnostic}</ReactMarkdown>
        </div>
      </div>

      {/* Loop Interativo de Refinamento */}
      {onRefine && (
        <div className="p-4 rounded-lg bg-slate-950 border border-blue-500/30 shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
              <MessageSquarePlus className="w-4 h-4 text-blue-400" />
              Deseja ajustar a proposta técnica? Envie observações para refinar a análise
            </label>
            <span className="text-[10px] text-slate-500">
              Reavalia com IA mantendo o contexto
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
            <textarea
              rows={2}
              placeholder="Ex.: Trocar a biblioteca de validação para Zod; Adicionar teste cobrindo payload vazio; Manter o nome do endpoint como /minha-rota..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              disabled={disabled || isSubmittingFeedback}
              className="flex-1 px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500 font-sans focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y shadow-inner leading-relaxed"
            />

            <Button
              size="sm"
              onClick={handleRefineSubmit}
              disabled={disabled || !feedback.trim() || isSubmittingFeedback}
              className="h-10 px-4 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-md shadow-blue-900/30 whitespace-nowrap rounded-lg"
            >
              {isSubmittingFeedback ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  Refinando...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  Refinar Análise
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};