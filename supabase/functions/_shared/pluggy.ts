/**
 * Cliente mínimo da API do Pluggy para uso dentro das Edge Functions.
 *
 * As credenciais (PLUGGY_CLIENT_ID / PLUGGY_CLIENT_SECRET) vivem só aqui, nos
 * secrets do Supabase — nunca no frontend.
 *
 * Contrato conferido contra os tipos do pluggy-sdk 0.90.0 e a referência da API.
 */

const PLUGGY_API = 'https://api.pluggy.ai';

export interface PluggyAccount {
  id: string;
  itemId: string;
  type: string;
  subtype?: string;
  name: string;
  balance: number;
  currencyCode: string;
}

export interface PluggyTransaction {
  id: string;
  accountId: string;
  description: string;
  /** Sempre positivo; a direção vem de `type`. */
  amount: number;
  date: string;
  type: 'DEBIT' | 'CREDIT';
  /** PENDING ainda pode mudar de valor ou sumir; POSTED está liquidada. */
  status?: 'PENDING' | 'POSTED';
}

export interface PluggyItem {
  id: string;
  status: string;
  connector?: { id: number; name: string; imageUrl?: string };
}

export interface ConnectTokenOptions {
  /** Amarra o item ao usuário do nosso lado, útil para suporte e deduplicação. */
  clientUserId?: string;
  avoidDuplicates?: boolean;
  webhookUrl?: string;
}

export class PluggyClient {
  private constructor(private readonly apiKey: string) {}

  /** A API key do Pluggy é de curta duração — cria uma por execução. */
  static async connect(): Promise<PluggyClient> {
    const clientId = Deno.env.get('PLUGGY_CLIENT_ID');
    const clientSecret = Deno.env.get('PLUGGY_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new Error('PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET não configurados');
    }

    const response = await fetch(`${PLUGGY_API}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, clientSecret }),
    });

    if (!response.ok) {
      throw new Error(`Falha ao autenticar no Pluggy: ${response.status} ${await response.text()}`);
    }

    const { apiKey } = (await response.json()) as { apiKey: string };
    return new PluggyClient(apiKey);
  }

  private async request<T>(
    path: string,
    init: { method?: string; params?: Record<string, string>; body?: unknown } = {},
  ): Promise<T> {
    const url = new URL(`${PLUGGY_API}/${path.replace(/^\//, '')}`);
    for (const [key, value] of Object.entries(init.params ?? {})) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url, {
      method: init.method ?? 'GET',
      headers: {
        'X-API-KEY': this.apiKey,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`Pluggy ${path} respondeu ${response.status}: ${await response.text()}`);
    }

    return (await response.json()) as T;
  }

  /** Token de curta duração que autoriza o widget no navegador. */
  async createConnectToken(options: ConnectTokenOptions = {}): Promise<string> {
    const { accessToken } = await this.request<{ accessToken: string }>('connect_token', {
      method: 'POST',
      body: { options },
    });
    return accessToken;
  }

  getItem(itemId: string): Promise<PluggyItem> {
    return this.request<PluggyItem>(`items/${itemId}`);
  }

  listAccounts(itemId: string): Promise<{ results: PluggyAccount[] }> {
    return this.request('accounts', { params: { itemId } });
  }

  /**
   * Percorre o extrato inteiro do período via paginação por cursor.
   *
   * O endpoint `/transactions` paginado por número de página está deprecado no
   * SDK e será removido; `/v2/transactions` devolve `{ results, next }`, onde
   * `next` é a URL da página seguinte com o cursor no parâmetro `after`.
   */
  async listTransactions(accountId: string, dateFrom: string): Promise<PluggyTransaction[]> {
    const collected: PluggyTransaction[] = [];
    let after: string | undefined;

    while (true) {
      const page = await this.request<{ results: PluggyTransaction[]; next: string | null }>(
        'v2/transactions',
        { params: { accountId, dateFrom, ...(after ? { after } : {}) } },
      );

      collected.push(...page.results);
      if (!page.next) break;

      const nextCursor = new URL(page.next, PLUGGY_API).searchParams.get('after');
      if (!nextCursor) break;
      after = nextCursor;
    }

    return collected;
  }
}

/** Pluggy manda valor positivo + direção; o banco guarda com sinal. */
export function signedAmount(transaction: PluggyTransaction): number {
  const magnitude = Math.abs(transaction.amount);
  return transaction.type === 'DEBIT' ? -magnitude : magnitude;
}

/**
 * Só sincronizamos transações liquidadas. Uma PENDING ainda pode mudar de valor
 * ou desaparecer, e como o upsert usa `ignoreDuplicates` para não sobrescrever
 * conciliações, ela ficaria congelada com o valor errado.
 */
export function isSettled(transaction: PluggyTransaction): boolean {
  return transaction.status === undefined || transaction.status === 'POSTED';
}
