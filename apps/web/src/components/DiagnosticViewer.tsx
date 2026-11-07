import React from 'react';
import ReactMarkdown from 'react-markdown';
import { CheckCircle2, XCircle, ShieldCheck } from 'lucide-react';
import { Button } from './ui/button';

interface DiagnosticViewerProps {
  diagnostic: string;
  taskId: string;
  onApprove: (taskId: string) => void;
  onReject: (taskId: string) => void;
  disabled?: boolean;
}

export const DiagnosticViewer: React.FC<DiagnosticViewerProps> = ({
  diagnostic,
  taskId,
  onApprove,
  onReject,
  disabled,
}) => {
  return (
    <div className="rounded-xl border border-blue-500/30 bg-slate-900/90 shadow-2xl p-6 backdrop-blur flex flex-col space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              Portão de Aprovação (Human-in-the-Loop)
            </h2>
            <p className="text-xs text-slate-400">
              Revise a análise e o blueprint técnico antes que o agente faça alterações físicas no repositório.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-3">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onReject(taskId)}
            disabled={disabled}
            className="flex items-center gap-1.5"
          >
            <XCircle className="w-4 h-4" />
            Rejeitar / Cancelar
          </Button>

          <Button
            variant="success"
            size="sm"
            onClick={() => onApprove(taskId)}
            disabled={disabled}
            className="flex items-center gap-1.5 font-semibold shadow-lg shadow-emerald-900/30"
          >
            <CheckCircle2 className="w-4 h-4" />
            Aprovar Implementação & PR
          </Button>
        </div>
      </div>

      {/* Markdown Content */}
      <div className="max-h-[420px] overflow-y-auto pr-2 prose prose-invert prose-sm max-w-none prose-pre:bg-slate-950 prose-pre:border prose-pre:border-slate-800 prose-headings:text-slate-100 prose-p:text-slate-300">
        <ReactMarkdown>{diagnostic}</ReactMarkdown>
      </div>
    </div>
  );
};
