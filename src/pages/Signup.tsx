import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, MailCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthShell } from '@/components/auth/AuthShell';
import { translateAuthError } from './Login';

export default function Signup() {
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (password.length < 6) {
      setError('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const { needsEmailConfirmation } = await signUp(email.trim(), password, fullName.trim());
      if (needsEmailConfirmation) {
        setAwaitingConfirmation(true);
        setSubmitting(false);
      } else {
        navigate('/', { replace: true });
      }
    } catch (cause) {
      setError(translateAuthError(cause));
      setSubmitting(false);
    }
  }

  if (awaitingConfirmation) {
    return (
      <AuthShell title="Confirme seu e-mail">
        <div className="flex flex-col items-center gap-3 text-center">
          <MailCheck className="h-8 w-8 text-success-ink" aria-hidden />
          <p className="text-sm text-ink-2">
            Enviamos um link de confirmação para <strong>{email}</strong>. Abra o link e depois
            faça login.
          </p>
          <Link to="/login" className="btn-secondary mt-2">
            Ir para o login
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Criar conta" subtitle="Comece a organizar suas finanças.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label" htmlFor="fullName">
            Nome
          </label>
          <input
            id="fullName"
            className="field"
            autoComplete="name"
            required
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
        </div>

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
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <p className="mt-1 text-xs text-ink-3">Mínimo de 6 caracteres.</p>
        </div>

        {error && <p className="text-sm text-danger-ink">{error}</p>}

        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Criar conta
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-2">
        Já tem conta?{' '}
        <Link to="/login" className="font-medium text-success-ink hover:underline">
          Entrar
        </Link>
      </p>
    </AuthShell>
  );
}
