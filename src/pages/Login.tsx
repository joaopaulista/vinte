import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthShell } from '@/components/auth/AuthShell';

export default function Login() {
  const { signIn, user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loading && user) {
    const from = (location.state as { from?: string } | null)?.from ?? '/';
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await signIn(email.trim(), password);
      navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true });
    } catch (cause) {
      setError(translateAuthError(cause));
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Entrar no VINTE" subtitle="Acesse seu painel financeiro.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            className="field"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="password">
            Senha
          </label>
          <input
            id="password"
            type="password"
            className="field"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        {error && <p className="text-sm text-danger-ink">{error}</p>}

        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Entrar
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-2">
        Ainda não tem conta?{' '}
        <Link to="/cadastro" className="font-medium text-success-ink hover:underline">
          Criar conta
        </Link>
      </p>
    </AuthShell>
  );
}

export function translateAuthError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);

  if (message.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (message.includes('Email not confirmed')) {
    return 'Confirme seu e-mail antes de entrar (verifique a caixa de entrada).';
  }
  if (message.includes('User already registered')) return 'Já existe uma conta com esse e-mail.';
  if (message.includes('Password should be at least')) {
    return 'A senha precisa ter pelo menos 6 caracteres.';
  }
  if (message.includes('Failed to fetch')) {
    return 'Não foi possível falar com o Supabase. Confira as variáveis em .env.';
  }
  return message;
}
