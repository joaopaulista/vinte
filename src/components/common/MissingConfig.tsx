import { AlertTriangle } from 'lucide-react';

/** Tela mostrada quando o .env não foi preenchido — evita um erro críptico de rede. */
export function MissingConfig() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card max-w-lg p-6">
        <div className="flex items-center gap-2 text-warn-ink">
          <AlertTriangle className="h-5 w-5" aria-hidden />
          <h1 className="text-lg font-semibold">Configuração do Supabase faltando</h1>
        </div>

        <p className="mt-3 text-sm text-ink-2">
          Crie um arquivo <code className="rounded bg-surface-2 px-1 py-0.5">.env</code> na raiz do
          projeto (use o <code className="rounded bg-surface-2 px-1 py-0.5">.env.example</code> como
          base) com:
        </p>

        <pre className="mt-3 overflow-x-auto rounded-lg bg-ink p-3 text-xs text-page">
          {`VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key`}
        </pre>

        <p className="mt-3 text-sm text-ink-2">
          Os dois valores estão em <strong>Project Settings → API</strong> no painel do Supabase.
          Depois de salvar, reinicie o <code className="rounded bg-surface-2 px-1 py-0.5">npm run dev</code>.
        </p>
      </div>
    </div>
  );
}
