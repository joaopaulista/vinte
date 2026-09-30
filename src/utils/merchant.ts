/**
 * Extrai um "apelido de estabelecimento" da descrição bancária, para virar
 * padrão de uma regra de categorização.
 *
 * Descrições de banco vêm cheias de ruído: "COMPRA CARTAO 1234 SUPERMERCADO
 * XYZ 12/03". O que identifica o gasto são as palavras que sobram depois de
 * tirar números, pontuação e os termos de operação.
 */
const NOISE_TOKENS = new Set([
  'pix', 'ted', 'doc', 'tev', 'compra', 'cartao', 'debito', 'credito',
  'enviado', 'enviada', 'recebido', 'recebida', 'pagamento', 'pgto', 'pag',
  'transferencia', 'transf', 'parcela', 'parc', 'saque', 'deposito',
  'ltda', 'eireli', 'mei', 'brasil', 'nac', 'int',
  'pagseguro', 'mercadopago', 'cielo', 'rede', 'stone', 'getnet',
  'com', 'para', 'por', 'sem', 'dos', 'das', 'nos', 'nas',
]);

export function derivePattern(description: string | null | undefined): string | null {
  if (!description) return null;

  const tokens = description
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // remove os acentos que o NFD separou
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ') // fora números e pontuação
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !NOISE_TOKENS.has(token));

  if (tokens.length === 0) return null;

  // Duas palavras costumam ser específicas o bastante sem virar a descrição
  // inteira (que nunca se repetiria por causa de datas e códigos).
  const pattern = tokens.slice(0, 2).join(' ');
  return pattern.length >= 4 ? pattern : null;
}

export interface DescriptionParts {
  /** Tipo da operação ("Transferência enviada", "Pix recebido"), quando dá para separar. */
  kind: string | null;
  /** Com quem foi a operação (favorecido, pagador ou estabelecimento). */
  name: string;
}

/** Começos de descrição que indicam o tipo da operação, não a contraparte. */
const OPERATION_PREFIX =
  /^((?:transfer[eê]ncia|transf|pix|ted|doc|tef|pagamento|pgto|pag|compra|boleto|d[eé]bito|cr[eé]dito|dep[oó]sito|saque|estorno|tarifa|rendimento)(?:\s+(?:enviad[oa]|recebid[oa]|agendad[oa]|autom[aá]tic[oa]|com\s+cart[aã]o|no\s+d[eé]bito|no\s+cr[eé]dito|de\s+boleto|de\s+conta|cart[aã]o|qr\s*code|instant[aâ]ne[oa]))*)\s*[-–—:|]\s*(.+)$/i;

/**
 * Separa a descrição do banco em "tipo | contraparte", para a conciliação
 * mostrar "Transferência enviada | EDP SAO PAULO DISTRIBUICAO DE ENERGIA S A".
 *
 * Reconhece o separador "|" (formato comum no Open Finance) e prefixos de
 * operação seguidos de "-", ":" ou "|". Quando não reconhece, devolve a
 * descrição inteira como nome — melhor mostrar o original que cortar errado.
 */
export function splitDescription(description: string | null | undefined): DescriptionParts {
  const text = (description ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return { kind: null, name: 'Sem descrição' };

  const pipe = text.indexOf('|');
  if (pipe > 0 && pipe < text.length - 1) {
    const kind = text.slice(0, pipe).trim();
    const name = text.slice(pipe + 1).trim();
    if (kind && name) return { kind: capitalize(kind), name };
  }

  const match = OPERATION_PREFIX.exec(text);
  if (match) return { kind: capitalize(match[1]), name: match[2].trim() };

  return { kind: null, name: text };
}

/** "TRANSFERENCIA ENVIADA" → "Transferencia enviada"; mantém o resto como veio. */
function capitalize(value: string): string {
  const lower = value.toLocaleLowerCase('pt-BR');
  return lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1);
}

/**
 * Tira a marcação de parcela do nome ("PARC 06/08", "6/8", "06 DE 08"),
 * que muda de uma parcela para outra da mesma compra.
 */
export function stripInstallment(name: string): string {
  return name
    .replace(/\b(parc(ela)?\.?\s*)?\d{1,2}\s*(\/|de)\s*\d{1,2}\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
