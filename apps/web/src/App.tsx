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
  Hash
} from 'lucide-react';

export function App() {
  const [cardId, setCardId] = useState('');
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

  const loadHistory = async () => {
    try {
      const res = await apiClient.get('/tasks/history');
      setHistory(res.data);
    } catch (err) {
      console.warn('Erro ao carregar histórico:', err);
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
              <Button size="sm" variant="outline" onClick={loadHistory}>
                Atualizar
              </Button>
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {history.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                          Nenhuma tarefa executada ainda.
                        </td>
                      </tr>
                    ) : (
                      history.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-800/30">
                          <td className="px-4 py-3 text-slate-400">
                            {new Date(t.createdAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 font-semibold text-white">
                            Card #{t.cardId} - {t.cardTitle}
                          </td>
                          <td className="px-4 py-3 text-slate-300">
                            {t.repository?.name || 'Local'}
                          </td>
                          <td className="px-4 py-3">
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
