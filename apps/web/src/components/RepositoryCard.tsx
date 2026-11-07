import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { FolderGit2, RefreshCw, Layers, Check, Database, TestTube2, CheckCircle2 } from 'lucide-react';

export interface RepositoryData {
  id?: string;
  name: string;
  localPath: string;
  framework?: string;
  validationLib?: string;
  orm?: string;
  testFramework?: string;
  lastCommitHash?: string;
  lastAnalyzedAt?: string;
  packageManager?: string;
}

interface RepositoryCardProps {
  repo: RepositoryData;
  onScan: (repo: RepositoryData) => void;
  isScanning?: boolean;
}

export const RepositoryCard: React.FC<RepositoryCardProps> = ({ repo, onScan, isScanning }) => {
  return (
    <Card className="hover:border-slate-700 transition-all shadow-md group">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-400 group-hover:scale-105 transition-transform">
              <FolderGit2 className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base text-white">{repo.name}</CardTitle>
              <CardDescription className="text-xs truncate max-w-[280px]" title={repo.localPath}>
                {repo.localPath}
              </CardDescription>
            </div>
          </div>

          <Button
            size="sm"
            variant="outline"
            className="h-8 px-2 text-xs flex items-center gap-1"
            onClick={() => onScan(repo)}
            disabled={isScanning}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            Scan
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pt-1 text-xs">
        {/* Badges de Metadados Identificados */}
        <div className="flex flex-wrap gap-1.5">
          {repo.framework && (
            <Badge variant="default" className="flex items-center gap-1">
              <Layers className="w-3 h-3" />
              {repo.framework}
            </Badge>
          )}

          {repo.validationLib && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <Check className="w-3 h-3" />
              {repo.validationLib}
            </Badge>
          )}

          {repo.orm && repo.orm !== 'Nenhum' && (
            <Badge variant="outline" className="flex items-center gap-1">
              <Database className="w-3 h-3" />
              {repo.orm}
            </Badge>
          )}

          {repo.testFramework && (
            <Badge variant="outline" className="flex items-center gap-1">
              <TestTube2 className="w-3 h-3" />
              {repo.testFramework}
            </Badge>
          )}
        </div>

        {/* Informações de Commit e Cache */}
        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Commit: <code className="text-slate-300 font-mono">{repo.lastCommitHash ? repo.lastCommitHash.substring(0, 7) : 'não analisado'}</code>
          </span>
          <span>
            {repo.lastAnalyzedAt ? new Date(repo.lastAnalyzedAt).toLocaleDateString() : 'Pendente'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};
