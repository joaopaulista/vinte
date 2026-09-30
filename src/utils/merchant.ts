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
