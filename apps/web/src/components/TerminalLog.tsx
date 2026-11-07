import React, { useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, Trash2 } from 'lucide-react';

export interface LogEntry {
  taskId: string;
  message: string;
  type: 'info' | 'warn' | 'error' | 'success';
  timestamp: string;
}

interface TerminalLogProps {
  logs: LogEntry[];
  onClear?: () => void;
  status?: string;
}

export const TerminalLog: React.FC<TerminalLogProps> = ({ logs, onClear, status }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getColor = (type: LogEntry['type']) => {
    switch (type) {
      case 'success':
        return 'text-emerald-400';
      case 'error':
        return 'text-red-400';
      case 'warn':
        return 'text-amber-400';
      default:
        return 'text-slate-300';
    }
  };

  return (
    <div className="flex flex-col h-full rounded-xl border border-slate-800 bg-slate-950/80 shadow-2xl overflow-hidden font-mono text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <TerminalIcon className="w-4 h-4 text-blue-400" />
          <span className="font-semibold text-slate-200">Terminal do Agente</span>
          {status && (
            <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30">
              {status}
            </span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <div className="flex space-x-1.5 mr-2">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
          </div>
          {onClear && (
            <button
              onClick={onClear}
              className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition-colors"
              title="Limpar terminal"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Logs stream */}
      <div className="flex-1 p-4 overflow-y-auto space-y-1.5 leading-relaxed selection:bg-blue-600 selection:text-white">
        {logs.length === 0 ? (
          <div className="text-slate-500 italic py-6 text-center">
            Aguardando início de tarefas para streaming dos logs em tempo real...
          </div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className="flex items-start space-x-2 animate-fadeIn">
              <span className="text-slate-600 select-none">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              <span className={`flex-1 break-all ${getColor(log.type)}`}>
                {log.message}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};
