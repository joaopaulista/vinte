import { derivePattern, splitDescription, stripInstallment } from './merchant';
import type { TransactionWithRelations } from '@/types';

/**
 * Sugestão de categoria aprendida com o histórico.
 *
 * Olha as transações que você já aprovou e procura as "parecidas" com a
 * pendente, em duas camadas, da mais específica para a mais geral:
 *   1. mesma contraparte ("EDP SAO PAULO DISTRIBUICAO DE ENERGIA S A");
 *   2. mesmo estabelecimento pelo apelido ("edp sao") — pega variações como
 *      "EDP SP" x "EDP SAO PAULO", ou "IFOOD *LOJA A" x "IFOOD *LOJA B".
 * Só compara entrada com entrada e saída com saída: um Pix recebido da
 * mesma pessoa para quem você paga aluguel não é aluguel.
 *
 * A sugestão é a combinação categoria + subcategoria mais usada nessas
 * parecidas, e só aparece se for maioria clara (≥ 60%). Nunca aprova nada:
 * só preenche o campo para você conferir.
 */

const MIN_SHARE = 0.6;

export interface CategorySuggestion {
  categoryId: string;
  subcategoryId: string | null;
  /** Quantas transações parecidas embasam a sugestão. */
  basis: number;
  /** Fração delas que usou exatamente essa combinação. */
  share: number;
}

type Tally = Map<string, number>;

function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function keysOf(transaction: Pick<TransactionWithRelations, 'description' | 'amount'>): string[] {
  const direction = transaction.amount >= 0 ? 'in' : 'out';
  const keys: string[] = [];
  // Sem a marcação de parcela: "LOJA X PARC 06/08" e "LOJA X PARC 07/08" são a mesma loja.
  const counterparty = normalize(stripInstallment(splitDescription(transaction.description).name));
  if (counterparty && counterparty !== 'sem descricao') keys.push(`${direction}|name|${counterparty}`);
  const pattern = derivePattern(transaction.description);
  if (pattern) keys.push(`${direction}|pattern|${pattern}`);
  return keys;
}

export function buildSuggester(history: TransactionWithRelations[]) {
  const index = new Map<string, Tally>();

  for (const transaction of history) {
    if (transaction.reconciliation_status !== 'approved' || !transaction.category_id) continue;
    const combo = `${transaction.category_id}|${transaction.subcategory_id ?? ''}`;
    for (const key of keysOf(transaction)) {
      const tally = index.get(key) ?? new Map<string, number>();
      tally.set(combo, (tally.get(combo) ?? 0) + 1);
      index.set(key, tally);
    }
  }

  return function suggest(
    transaction: Pick<TransactionWithRelations, 'description' | 'amount'>,
  ): CategorySuggestion | null {
    for (const key of keysOf(transaction)) {
      const tally = index.get(key);
      if (!tally) continue;

      const basis = [...tally.values()].reduce((sum, count) => sum + count, 0);
      const [combo, count] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
      const share = count / basis;
      if (share < MIN_SHARE) continue; // histórico dividido: tenta a camada mais geral

      const [categoryId, subcategoryId] = combo.split('|');
      return { categoryId, subcategoryId: subcategoryId || null, basis, share };
    }
    return null;
  };
}
