import { useState, useEffect } from 'react';
import { apiClient, createWebSocketConnection } from './services/api';
import { TerminalLog, LogEntry } from './components/TerminalLog';
import { DiagnosticViewer } from './components/DiagnosticViewer';
import { RepositoryCard, RepositoryData } from './components/RepositoryCard';
import { Button } from './components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './components/ui/card';
import { Badge } from './components/ui/badge';
import {
  Play,
  Bot,
  FolderGit2,
  ExternalLink,
  Wifi,
  WifiOff,
  History,
  CheckCircle,
  Hash,
  FileText,
  Trash2,
  Archive,
  ArchiveRestore,
  Eye,
  RefreshCw
} from 'lucide-react';

export function App() {
  const [cardId, setCardId] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<string>('');
  const [repositories, setRepositories] = useState<RepositoryData[]>([]);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<string>('IDLE');
  const [diagnostic, setDiagnostic] = useState<string | null>(null);
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [scanningRepo, setScanningRepo] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [activeTab, setActiveTab] = useState<'agent' | 'repos' | 'history'>('agent');

  // Conexão WebSocket
  useEffect(() => {
    const socket = createWebSocketConnection();

    socket.on('connect', () => {
      setIsConnected(true);
      console.log('🔌 Conectado ao servidor WebSocket');
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      console.log('🔌 Desconectado do servidor WebSocket');
    });

    socket.on('task:log', (log: LogEntry) => {
      setLogs((prev) => [...prev, log]);
    });

    socket.on('task:status', (data: { taskId: string; status: string; metadata?: any }) => {
      setTaskStatus(data.status);
      if (data.metadata?.diagnostic) {
        setDiagnostic(data.metadata.diagnostic);
      }
      if (data.metadata?.pullRequestUrl) {
        setPrUrl(data.metadata.pullRequestUrl);
      }
    });

    socket.on('task:approval_required', (data: { taskId: string; diagnostic: string }) => {
      setCurrentTaskId(data.taskId);
      setDiagnostic(data.diagnostic);
      setTaskStatus('WAITING_APPROVAL');
    });

    loadRepositories();
    loadHistory();

    return () => {
      socket.disconnect();
    };
  }, []);

  const loadRepositories = async () => {
    try {
      const res = await apiClient.get('/repositories');
      const diskRepos = res.data.availableOnDisk || [];
      const dbRepos = res.data.cachedInDatabase || [];

      // Faz merge dos repositórios do disco com metadados do banco
      const merged: RepositoryData[] = diskRepos.map((item: any) => {
        const cached = dbRepos.find((db: any) => db.name === item.name);
        return {
          name: item.name,
          localPath: item.path,
          framework: cached?.framework,
          validationLib: cached?.validationLib,
          orm: cached?.orm,
          testFramework: cached?.testFramework,
          lastCommitHash: cached?.lastCommitHash,
          lastAnalyzedAt: cached?.lastAnalyzedAt,
          packageManager: cached?.packageManager,
        };
      });

      setRepositories(merged);
      if (merged.length > 0 && !selectedRepo) {
        setSelectedRepo(merged[0].localPath);
      }
    } catch (err) {
      console.warn('Erro ao carregar repositórios:', err);
    }
  };

  const loadHistory = async (includeArchived = showAllHistory) => {
    try {
      const res = await apiClient.get(`/tasks/history?includeArchived=${includeArchived}`);
      setHistory(res.data);
    } catch (err) {
      console.warn('Erro ao carregar histórico:', err);
    }
  };

  const handleToggleHistoryFilter = () => {
    const nextState = !showAllHistory;
    setShowAllHistory(nextState);
    loadHistory(nextState);
  };

  const handleArchiveTask = async (id: string, cardTitle: string) => {
    if (!window.confirm(`Deseja arquivar "${cardTitle}"? Ela não será mais exibida na lista de tarefas ativas.`)) {
      return;
    }
    try {
      await apiClient.patch(`/tasks/${id}/archive`);
      await loadHistory();
    } catch (err) {
      console.error('Erro ao arquivar tarefa:', err);
    }
  };

  const handleRestoreTask = async (id: string) => {
    try {
      await apiClient.patch(`/tasks/${id}/restore`);
      await loadHistory();
    } catch (err) {
      console.error('Erro ao restaurar tarefa:', err);
    }
  };

  const handleStartTask = async () => {
    if (!cardId.trim() || !selectedRepo) return;
    setIsLoading(true);
    setDiagnostic(null);
    setPrUrl(null);
    setLogs([]);
    setTaskStatus('INICIANDO');

    try {
      const selectedRepoObj = repositories.find((r) => r.localPath === selectedRepo);
      const res = await apiClient.post('/tasks/start', {
        cardId: cardId.trim(),
        repoPath: selectedRepo,
        repoName: selectedRepoObj?.name,
        customInstructions: customInstructions.trim() || undefined,
      });

      setCurrentTaskId(res.data.taskId);
    } catch (err: any) {
      setLogs((prev) => [
        ...prev,
        {
          taskId: 'error',
          message: `Falha ao iniciar tarefa: ${err.response?.data?.message || err.message}`,
          type: 'error',
          timestamp: new Date().toISOString(),
        },
      ]);
      setTaskStatus('FAILED');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (taskId: string) => {
    try {
      await apiClient.post(`/tasks/${taskId}/approve`, { approved: true });
      setDiagnostic(null);
      setTaskStatus('IMPLEMENTING');
    } catch (err: any) {
      console.error('Falha ao aprovar:', err);
    }
  };

  const handleReject = async (taskId: string) => {
    try {
      await apiClient.post(`/tasks/${taskId}/approve`, { approved: false });
      setDiagnostic(null);
      setTaskStatus('REJECTED');
    } catch (err: any) {
      console.error('Falha ao rejeitar:', err);
    }
  };

  const handleScanRepo = async (repo: RepositoryData) => {
    setScanningRepo(repo.name);
    try {
      await apiClient.post('/repositories/scan', {
        repoPath: repo.localPath,
        repoName: repo.name,
        force: true,
      });
      await loadRepositories();
    } catch (err) {
      console.error('Erro ao re-escanear repositório:', err);
    } finally {
      setScanningRepo(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-600 rounded-lg text-white shadow-lg shadow-blue-500/20">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-none">
                Agente Backend Autônomo
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                Kanbanize ➔ NestJS/Zod ➔ Azure DevOps
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center space-x-1 bg-slate-800/60 p-1 rounded-lg border border-slate-700/60">
            <button
              onClick={() => setActiveTab('agent')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                activeTab === 'agent'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Executar Tarefa
            </button>
            <button
              onClick={() => setActiveTab('repos')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                activeTab === 'repos'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Repositórios ({repositories.length})
            </button>
            <button
              onClick={() => {
                setActiveTab('history');
                loadHistory();
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                activeTab === 'history'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Histórico
            </button>
          </div>

          {/* Status Badge */}
          <div className="flex items-center space-x-2 text-xs">
            {isConnected ? (
              <Badge variant="success" className="flex items-center gap-1.5">
                <Wifi className="w-3.5 h-3.5" />
                API Conectada
              </Badge>
            ) : (
              <Badge variant="destructive" className="flex items-center gap-1.5">
                <WifiOff className="w-3.5 h-3.5" />
                Desconectado
              </Badge>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto px-6 py-6 w-full space-y-6">
        {activeTab === 'agent' && (
          <div className="space-y-6">
            {/* Input Bar */}
            <Card className="bg-slate-900/80 border-slate-700/80 shadow-2xl">
              <CardHeader className="pb-3 border-b border-slate-800">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 bg-blue-500/20 text-blue-400 rounded-md">
                    <Hash className="w-4 h-4" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-bold text-white">Disparar Execução de Tarefa</CardTitle>
                    <CardDescription className="text-xs text-slate-400">
                      Informe o ID do card para o agente analisar os requisitos e estruturar a solução no repositório.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-5 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                  <div className="md:col-span-3">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-200 mb-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                      Card ID (Kanbanize)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex.: 1001, 12345"
                      value={cardId}
                      onChange={(e) => setCardId(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-inner"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Número de identificação do card</p>
                  </div>

                  <div className="md:col-span-6">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-200 mb-1.5">
                      <FolderGit2 className="w-3.5 h-3.5 text-blue-400" />
                      Repositório Vinculado
                    </label>
                    <select
                      value={selectedRepo}
                      onChange={(e) => setSelectedRepo(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {repositories.length === 0 ? (
                        <option value="">Nenhum repositório local detectado</option>
                      ) : (
                        repositories.map((repo) => (
                          <option key={repo.localPath} value={repo.localPath}>
                            {repo.name} ({repo.framework || 'Node'} - {repo.localPath})
                          </option>
                        ))
                      )}
                    </select>
                    <p className="text-[10px] text-slate-400 mt-1">Projeto onde a branch e o código serão criados</p>
                  </div>

                  <div className="md:col-span-3">
                    <Button
                      onClick={handleStartTask}
                      disabled={isLoading || !cardId || !selectedRepo}
                      className="w-full h-11 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 font-semibold shadow-lg shadow-blue-900/30 text-white rounded-lg"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      Iniciar Execução
                    </Button>
                    <p className="text-[10px] text-transparent mt-1 select-none">ação</p>
                  </div>
                </div>

                {/* Instruções Adicionais em Markdown */}
                <div className="mt-4 pt-4 border-t border-slate-800">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                      <FileText className="w-3.5 h-3.5 text-blue-400" />
                      Instruções Adicionais / Contexto Manual (Markdown opcional)
                    </label>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {customInstructions.length} caracteres
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    placeholder="Adicione informações complementares que não estão no card (ex.: regras de negócio específicas, bibliotecas mandatórias, restrições ou exemplos)..."
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700/80 rounded-lg text-xs text-slate-100 placeholder-slate-500 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y shadow-inner leading-relaxed"
                  />
                  <div className="flex items-center justify-between mt-1 text-[10px] text-slate-400">
                    <span>💡 Suporta formatação livre em Markdown (listas, seções, blocos de código).</span>
                    {customInstructions && (
                      <button
                        type="button"
                        onClick={() => setCustomInstructions('')}
                        className="text-slate-500 hover:text-slate-300 transition-colors"
                      >
                        Limpar texto
                      </button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Sucesso / PR Aberto */}
            {prUrl && (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between animate-fadeIn">
                <div className="flex items-center space-x-3">
                  <CheckCircle className="w-6 h-6 text-emerald-400" />
                  <div>
                    <h3 className="font-bold text-emerald-300">Pull Request Aberto com Sucesso!</h3>
                    <p className="text-xs text-slate-400">{prUrl}</p>
                  </div>
                </div>
                <a
                  href={prUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-md flex items-center gap-1.5 transition-colors"
                >
                  Ver no Azure DevOps
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}

            {/* Visualizador de Diagnóstico para Aprovação Humana */}
            {diagnostic && currentTaskId && taskStatus === 'WAITING_APPROVAL' && (
              <DiagnosticViewer
                diagnostic={diagnostic}
                taskId={currentTaskId}
                onApprove={handleApprove}
                onReject={handleReject}
              />
            )}

            {/* Terminal em Tempo Real */}
            <div className="h-[460px]">
              <TerminalLog
                logs={logs}
                status={taskStatus}
                onClear={() => setLogs([])}
              />
            </div>
          </div>
        )}

        {activeTab === 'repos' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <FolderGit2 className="w-5 h-5 text-blue-400" />
                  Repositórios Locais Mapeados
                </h2>
                <p className="text-xs text-slate-400">
                  Estrutura analisada e persistida em cache local no PostgreSQL.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={loadRepositories}>
                Recarregar Lista
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {repositories.map((repo) => (
                <RepositoryCard
                  key={repo.localPath}
                  repo={repo}
                  onScan={handleScanRepo}
                  isScanning={scanningRepo === repo.name}
                />
              ))}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <History className="w-5 h-5 text-blue-400" />
                  Histórico de Execuções
                </h2>
                <p className="text-xs text-slate-400">
                  Tarefas processadas pelo agente e PRs gerados.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={showAllHistory ? 'secondary' : 'outline'}
                  onClick={handleToggleHistoryFilter}
                  className={`flex items-center gap-1.5 text-xs ${
                    showAllHistory
                      ? 'bg-slate-700 hover:bg-slate-600 text-white border-slate-600'
                      : 'border-slate-700 text-slate-300 hover:text-white'
                  }`}
                >
                  {showAllHistory ? (
                    <>
                      <Eye className="w-3.5 h-3.5 text-blue-400" />
                      Apenas Ativos
                    </>
                  ) : (
                    <>
                      <Archive className="w-3.5 h-3.5 text-slate-400" />
                      Mostrar Todos
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => loadHistory()}
                  className="border-slate-700 text-slate-300 hover:text-white flex items-center gap-1.5 text-xs"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Atualizar
                </Button>
              </div>
            </div>

            <Card className="bg-slate-900/60 border-slate-800">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-3">Data</th>
                      <th className="px-4 py-3">Card</th>
                      <th className="px-4 py-3">Repositório</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Pull Request</th>
                      <th className="px-4 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {history.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                          {showAllHistory
                            ? 'Nenhuma tarefa encontrada no histórico.'
                            : 'Nenhuma tarefa ativa no momento.'}
                        </td>
                      </tr>
                    ) : (
                      history.map((t) => (
                        <tr
                          key={t.id}
                          className={`hover:bg-slate-800/30 transition-colors ${
                            t.isArchived ? 'opacity-60 bg-slate-950/40' : ''
                          }`}
                        >
                          <td className="px-4 py-3 text-slate-400 font-mono">
                            {new Date(t.createdAt).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="px-4 py-3 font-semibold text-white">
                            Card #{t.cardId} - {t.cardTitle}
                          </td>
                          <td className="px-4 py-3 text-slate-300">
                            {t.repository?.name || 'Local'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge
                                variant={
                                  t.status === 'COMPLETED'
                                    ? 'success'
                                    : t.status === 'FAILED'
                                    ? 'destructive'
                                    : 'warning'
                                }
                              >
                                {t.status}
                              </Badge>
                              {t.isArchived && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                                  Arquivado
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {t.pullRequestUrl ? (
                              <a
                                href={t.pullRequestUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-400 hover:underline flex items-center gap-1"
                              >
                                Ver PR <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span className="text-slate-500">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {t.isArchived ? (
                              <button
                                onClick={() => handleRestoreTask(t.id)}
                                title="Restaurar tarefa arquivada"
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
                              >
                                <ArchiveRestore className="w-3.5 h-3.5 text-blue-400" />
                                Restaurar
                              </button>
                            ) : (
                              <button
                                onClick={() => handleArchiveTask(t.id, t.cardTitle)}
                                title="Arquivar esta execução (ocultar da lista padrão)"
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded bg-slate-900 hover:bg-red-950/60 text-slate-400 hover:text-red-300 border border-slate-800 hover:border-red-800/60 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Arquivar
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
