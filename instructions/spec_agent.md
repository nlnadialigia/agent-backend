# Agente CLI: Kanbanize ➔ NestJS (Zod) ➔ Azure DevOps PR

Documento de especificação técnica, arquitetura e fluxo de implementação para desenvolvimento de agente CLI autônomo com validação humana (Human-in-the-Loop).

---

## 1. Contexto e Objetivos

* **Perfil:** Desenvolvedora FullStack Sênior (Node/TypeScript) e Pleno (Python).
* **Stack Principal do Backend:** NestJS com validação estrita via **Zod** (sem `class-validator`/`class-transformer`).
* **Frontend:** Next.js (consome contratos TypeScript gerados a partir dos schemas Zod).
* **Integração com Otimizador (Python):** Ingestão unidirecional (leitura passiva de cenários otimizados gerados pelo cientista de dados).
* **Ferramental:** Kanbanize (gestão de tarefas), Azure DevOps (repositório Git e Pull Requests), Gemini API / Enterprise / Pro (motor do agente).
* **Modo de Operação:** Linha de comando desacoplada da IDE (CLI local standalone).

---

## 2. Visão Geral da Arquitetura

O agente opera em duas fases sequenciais com portão de aprovação humana:

```
[CLI: python agent.py <CARD_ID>]
             │
             ▼
   [FASE 1: DIAGNÓSTICO]
   ├── Consulta REST API do Kanbanize
   ├── Analisa escopo, entidades e regras
   ├── Modela Schema Zod do cenário otimizado (Python)
   ├── Modela Schemas Zod de I/O das rotas NestJS
   └── Gera blueprint técnico estruturado
             │
             ▼
   [PORTÃO DE APROVAÇÃO (Human-in-the-Loop)]
   ├── Exibe diagnóstico no terminal
   └── Prompt: "Aprovar implementação e PR? (s/n)"
             │
       ┌─────┴─────┐
     (s)           (n) ──> Aborta sem alterar repositório
       │
       ▼
   [FASE 2: EXECUÇÃO AUTÔNOMA]
   ├── Cria branch local (`feat/card-<ID>`)
   ├── Gera e grava arquivos TypeScript (schemas, controllers, services, tests)
   ├── Executa validação local (`npm run lint` e `npm test`)
   ├── Faz Git commit e push para o Azure DevOps
   └── Abre Pull Request via `az repos pr create`
```

---

## 3. Pré-Requisitos de Ambiente

### 3.1. Variáveis de Ambiente (`.env`)
```bash
GEMINI_API_KEY="seu-token-gemini"
KANBANIZE_API_KEY="seu-token-kanbanize"
KANBANIZE_SUBDOMAIN="sua-empresa"
AZURE_DEVOPS_ORG_URL="https://dev.azure.com/SuaOrg"
AZURE_DEVOPS_PROJECT="SeuProjeto"
```

### 3.2. Dependências Python
```bash
pip install google-genai requests pydantic python-dotenv
```

### 3.3. Configuração do Azure CLI (`az`)
```bash
az extension add --name azure-devops
az devops login --organization https://dev.azure.com/SuaOrg
az devops configure --defaults organization=https://dev.azure.com/SuaOrg project=SeuProjeto
```

---

## 4. Diretrizes Arquiteturais do Backend (NestJS + Zod)

### Regras Mandatórias:
1. **Validação:** Uso exclusivo de Zod. É terminantemente proibido o uso de decorators `@IsString()`, `@IsNotEmpty()` ou bibliotecas `class-validator`/`class-transformer`.
2. **DTOs e Tipos:** Todos os tipos de entrada e saída devem ser exportados via inferência do Zod:
   ```typescript
   import { z } from 'zod';

   export const OptimizedScenarioSchema = z.object({
     scenarioId: z.string().uuid(),
     score: z.number().nonnegative(),
     metrics: z.record(z.string(), z.number()),
     generatedAt: z.string().datetime(),
   });

   export type OptimizedScenarioDto = z.infer<typeof OptimizedScenarioSchema>;
   ```
3. **Pipes:** Validação realizada por `ZodValidationPipe` customizado ou integrado na rota:
   ```typescript
   import { PipeTransform, BadRequestException } from '@nestjs/common';
   import { ZodSchema } from 'zod';

   export class ZodValidationPipe implements PipeTransform {
     constructor(private schema: ZodSchema) {}

     transform(value: unknown) {
       const result = this.schema.safeParse(value);
       if (!result.success) {
         throw new BadRequestException({
           message: 'Validation failed',
           errors: result.error.flatten(),
         });
       }
       return result.data;
     }
   }
   ```
4. **Ingestão do Otimizador:** Como o backend apenas consome o cenário otimizado, o schema deve garantir validação robusta contra valores `null`, `NaN` ou formatos inesperados provenientes do pipeline de ciência de dados.

---

## 5. Código de Referência do Agente (`agent.py`)

```python
import os
import sys
import json
import subprocess
import requests
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
KANBANIZE_API_KEY = os.getenv("KANBANIZE_API_KEY")
KANBANIZE_SUBDOMAIN = os.getenv("KANBANIZE_SUBDOMAIN")

# ==========================================
# FERRAMENTAS DO AGENTE (TOOLS)
# ==========================================

def get_kanbanize_card(card_id: str) -> dict:
    url = f"https://{KANBANIZE_SUBDOMAIN}.kanbanize.com/api/v2/cards/{card_id}"
    res = requests.get(url, headers={"apikey": KANBANIZE_API_KEY})
    res.raise_for_status()
    card_data = res.json()["data"]
    return {
        "title": card_data.get("title"),
        "description": card_data.get("description")
    }

def write_file(filepath: str, content: str) -> str:
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)
    return f"Arquivo '{filepath}' criado/atualizado com sucesso."

def run_cmd(cmd: list[str]) -> str:
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"Erro no comando '{' '.join(cmd)}':\n{res.stderr}")
    return res.stdout.strip()

def create_azure_pr(title: str, description: str, source_branch: str, target_branch: str = "main") -> str:
    cmd = [
        "az", "repos", "pr", "create",
        "--source-branch", source_branch,
        "--target-branch", target_branch,
        "--title", title,
        "--description", description,
        "--open"
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        return f"Falha ao abrir PR: {res.stderr}"
    data = json.loads(res.stdout)
    return f"PR criada com sucesso: {data.get('url')} (ID: {data.get('pullRequestId')})"

# ==========================================
# SYSTEM PROMPT
# ==========================================

SYSTEM_PROMPT = """
Você é um Arquiteto de Software Sênior especialista em NestJS, Zod e TypeScript.
Suas regras inegociáveis:
1. VALIDAÇÃO: Use EXCLUSIVAMENTE Zod (`z.infer`, schemas estritos). Proibido class-validator.
2. OTIMIZADOR PYTHON: O sistema apenas consome o cenário otimizado. Crie schemas Zod detalhados para garantir que o payload vindo do Python seja validado com segurança (`safeParse`).
3. TESTES: Todo service e schema deve ter testes unitários Jest (`.spec.ts`) cobrindo casos de sucesso e dados inválidos.
4. PADRÕES: Módulos NestJS organizados em controller, service, module, schemas e specs.
"""

# ==========================================
# FLUXO DE EXECUÇÃO
# ==========================================

def run_agent(card_id: str):
    print(f"\n📥 [1/4] Buscando card #{card_id} no Kanbanize...")
    card = get_kanbanize_card(card_id)
    print(f"Card encontrado: {card['title']}")

    diag_prompt = f"""
    Analise o seguinte card e elabore o diagnóstico técnico:
    Título: {card['title']}
    Descrição: {card['description']}

    Estrutura requerida:
    1. Escopo e Requisitos Técnicos
    2. Schema Zod do cenário recebido do Otimizador Python
    3. Schemas Zod de I/O das rotas NestJS (prontos para exportar tipagem ao Next.js)
    4. Lista de arquivos a criar/modificar
    5. Estratégia de testes unitários Jest
    """

    print("🧠 [2/4] Gerando diagnóstico arquitetural...")
    diag_res = client.models.generate_content(
        model="gemini-2.5-pro",
        contents=diag_prompt,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            temperature=0.2
        )
    )

    print("\n" + "=" * 80)
    print("DIAGNÓSTICO TÉCNICO GERADO:")
    print("=" * 80)
    print(diag_res.text)
    print("=" * 80)

    # Human-in-the-Loop Approval
    confirm = input("\nAprovar diagnóstico e iniciar implementação? (s/n): ").strip().lower()
    if confirm != "s":
        print("❌ Operação abortada.")
        return

    branch_name = f"feat/card-{card_id}"
    print(f"\n🌿 [3/4] Criando branch {branch_name}...")
    run_cmd(["git", "checkout", "-b", branch_name])

    impl_prompt = f"""
    Com base no diagnóstico aprovado:
    {diag_res.text}

    Gere o código completo e use a ferramenta `write_file` para gravar todos os arquivos.
    Certifique-se de salvar os schemas, controllers, services e arquivos `.spec.ts`.
    """

    print("⚡ [4/4] Implementando código e salvando arquivos...")
    client.models.generate_content(
        model="gemini-2.5-pro",
        contents=impl_prompt,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            tools=[write_file],
            temperature=0.1
        )
    )

    # Verificação de qualidade antes do push
    print("\n🧪 Executando testes locais...")
    try:
        run_cmd(["npm", "test"])
        print("✅ Testes unitários passaram.")
    except Exception as e:
        print(f"⚠️ Atenção: Falha nos testes:\n{e}")
        retry = input("Deseja continuar com o commit mesmo assim? (s/n): ").strip().lower()
        if retry != "s":
            print("❌ Operação cancelada para ajustes manuais.")
            return

    # Git Commit e Push
    commit_msg = f"feat: implementa integracao do card #{card_id} - {card['title']}"
    run_cmd(["git", "add", "."])
    run_cmd(["git", "commit", "-m", commit_msg])
    run_cmd(["git", "push", "-u", "origin", branch_name])

    # Criação de PR
    print("🚀 Abrindo Pull Request no Azure DevOps...")
    pr_desc = f"### Implementação Automatizada - Card #{card_id}\n\n{diag_res.text}"
    pr_status = create_azure_pr(
        title=commit_msg,
        description=pr_desc,
        source_branch=branch_name
    )
    print(pr_status)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python agent.py <CARD_ID>")
        sys.exit(1)
    run_agent(sys.argv[1])
```

---

## 6. Próximos Passos no Desenvolvimento

1. **Configuração de Variáveis:** Preencher credenciais no arquivo `.env`.
2. **Mock de Teste:** Executar o script passando o ID de um card de teste para validar o retorno do diagnóstico.
3. **Ajuste de Caminhos:** Mapear o diretório raiz das pastas do NestJS (`src/modules/...`) para que o `write_file` grave nos diretórios corretos do seu repositório.
4. **Hook de Lint:** Adicionar `npm run lint -- --fix` antes do `npm test` para garantir formatação limpa no commit.