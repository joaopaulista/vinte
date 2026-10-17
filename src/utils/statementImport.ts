/**
 * Leitura de extrato bancário (OFX ou CSV) para importar na conciliação.
 *
 * Tudo acontece no navegador: o arquivo não sai da máquina, só as linhas que
 * o usuário confirmar viram transações pendentes.
 */

export interface StatementLine {
  /** Posição no arquivo, para servir de chave estável na prévia. */
  index: number;
  date: string; // AAAA-MM-DD
  description: string;
  amount: number; // negativo = saída
}

export interface ParsedStatement {
  format: 'ofx' | 'csv';
  lines: StatementLine[];
  /** Linhas que não deu para entender (data ou valor inválido). */
  skipped: number;
}

/** OFX de banco brasileiro costuma vir em Windows-1252; o resto, em UTF-8. */
export async function readStatementFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

export function parseStatement(text: string, fileName: string): ParsedStatement {
  const looksLikeOfx = /<OFX>|<STMTTRN>/i.test(text) || /\.(ofx|qfx)$/i.test(fileName);
  return looksLikeOfx ? parseOfx(text) : parseCsv(text);
}

// ---------------------------------------------------------------------------
// OFX — SGML sem tags de fechamento: <TRNAMT>-45.90
// ---------------------------------------------------------------------------

function parseOfx(text: string): ParsedStatement {
  const blocks = text.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi) ?? [];
  const lines: StatementLine[] = [];
  let skipped = 0;

  const tag = (block: string, name: string) =>
    block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, 'i'))?.[1]?.trim() ?? '';

  blocks.forEach((block) => {
    const rawDate = tag(block, 'DTPOSTED');
    const date = /^\d{8}/.test(rawDate)
      ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
      : null;
    const amount = parseAmount(tag(block, 'TRNAMT'));
    const description = [tag(block, 'NAME'), tag(block, 'MEMO')]
      .filter((part, position, all) => part && all.indexOf(part) === position)
      .join(' · ');

    if (!date || !isValidDate(date) || amount === null || amount === 0) {
      skipped += 1;
      return;
    }
    lines.push({ index: lines.length, date, description: description || 'Sem descrição', amount });
  });

  return { format: 'ofx', lines, skipped };
}

// ---------------------------------------------------------------------------
// CSV — cabeçalho com data, descrição e valor (ou crédito e débito separados)
// ---------------------------------------------------------------------------

function normalizeHeader(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

const isDateHeader = (cell: string) => cell.startsWith('data') || cell.startsWith('date');

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function parseCsv(text: string): ParsedStatement {
  const rows = text.replace(/^﻿/, '').split(/\r?\n/).filter((row) => row.trim() !== '');
  if (rows.length === 0) return { format: 'csv', lines: [], skipped: 0 };

  // Exportação brasileira usa ";" (a vírgula é o decimal); a internacional, ",".
  const delimiter = (rows[0].match(/;/g)?.length ?? 0) >= (rows[0].match(/,/g)?.length ?? 0) ? ';' : ',';

  // O cabeçalho nem sempre é a primeira linha: alguns bancos põem o nome da
  // conta e o período antes. Procura a primeira linha com a coluna de data.
  const headerAt = rows.findIndex((row) =>
    splitCsvLine(row, delimiter).some((cell) => isDateHeader(normalizeHeader(cell))),
  );
  if (headerAt === -1) {
    throw new Error('Não achei o cabeçalho do CSV. Ele precisa ter as colunas Data, Descrição e Valor.');
  }

  const header = splitCsvLine(rows[headerAt], delimiter).map(normalizeHeader);
  const find = (...names: string[]) => header.findIndex((cell) => names.some((name) => cell.includes(name)));
  const dateCol = header.findIndex(isDateHeader);
  const descriptionCol = find('descri', 'historico', 'lancamento', 'memo', 'estabelecimento', 'titulo');
  const amountCol = find('valor', 'amount', 'quantia');
  const creditCol = find('credito', 'credit', 'entrada');
  const debitCol = find('debito', 'debit', 'saida');

  if (amountCol === -1 && creditCol === -1 && debitCol === -1) {
    throw new Error('O CSV precisa de uma coluna Valor (ou Crédito e Débito).');
  }

  const lines: StatementLine[] = [];
  let skipped = 0;

  for (const row of rows.slice(headerAt + 1)) {
    const cells = splitCsvLine(row, delimiter);
    const date = parseDate(cells[dateCol] ?? '');
    let amount: number | null;
    if (amountCol !== -1) {
      amount = parseAmount(cells[amountCol] ?? '');
    } else {
      const credit = parseAmount(cells[creditCol] ?? '') ?? 0;
      const debit = parseAmount(cells[debitCol] ?? '') ?? 0;
      amount = Math.abs(credit) - Math.abs(debit);
    }
    const description = (descriptionCol !== -1 ? cells[descriptionCol] : '') || 'Sem descrição';

    // Linhas de saldo ("SALDO ANTERIOR") não são lançamentos.
    if (/^saldo\b/i.test(normalizeHeader(description))) continue;
    if (!date || amount === null || amount === 0) {
      skipped += 1;
      continue;
    }
    lines.push({ index: lines.length, date, description, amount });
  }

  return { format: 'csv', lines, skipped };
}

// ---------------------------------------------------------------------------
// Valores e datas
// ---------------------------------------------------------------------------

/** Aceita "-1.234,56", "1234.56", "R$ 45,90", "45,90-" e "(45,90)". */
export function parseAmount(raw: string): number | null {
  let value = raw.replace(/R\$|\s/g, '');
  if (!value) return null;
  let negative = false;
  if (/^\(.*\)$/.test(value) || value.endsWith('-')) {
    negative = true;
    value = value.replace(/[()]/g, '').replace(/-$/, '');
  }
  if (value.startsWith('-')) {
    negative = !negative;
    value = value.slice(1);
  } else if (value.startsWith('+')) {
    value = value.slice(1);
  }

  const lastComma = value.lastIndexOf(',');
  const lastDot = value.lastIndexOf('.');
  if (lastComma > lastDot) {
    value = value.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma && lastComma !== -1) {
    value = value.replace(/,/g, '');
  }

  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round((negative ? -number : number) * 100) / 100;
}

/** Recusa "2026-02-30": o Date "rolaria" para 2 de março. */
function isValidDate(iso: string): boolean {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/** "15/10/2026", "15/10/26", "2026-10-15" → "2026-10-15". */
function parseDate(raw: string): string | null {
  const value = raw.trim();
  let match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return isValidDate(match[0]) ? match[0] : null;
  match = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (!match) return null;
  const [, day, month, year] = match;
  const fullYear = year.length === 2 ? `20${year}` : year;
  const iso = `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  return isValidDate(iso) ? iso : null;
}

// ---------------------------------------------------------------------------
// Regra de negócio: o que já foi lançado não entra de novo
// ---------------------------------------------------------------------------

export type LineVerdict = { status: 'new' } | { status: 'duplicate'; existingDescription: string | null };

export interface ExistingEntry {
  transaction_date: string;
  amount: number;
  description: string | null;
}

/** Mesma data e mesmo valor = mesmo lançamento. */
function entryKey(date: string, amount: number): string {
  return `${date}|${amount.toFixed(2)}`;
}

/**
 * Já existe transação na conta com a mesma data e o mesmo valor? Então a linha
 * do extrato é recusada, qualquer que seja o status da existente (pendente,
 * aprovada ou reprovada): reimportar o mesmo arquivo não duplica nada, e o que
 * foi reprovado de propósito não volta para a fila.
 */
export function classifyLines(lines: StatementLine[], existing: ExistingEntry[]): Map<number, LineVerdict> {
  const byKey = new Map<string, ExistingEntry>();
  for (const entry of existing) byKey.set(entryKey(entry.transaction_date, Number(entry.amount)), entry);

  const verdicts = new Map<number, LineVerdict>();
  for (const line of lines) {
    const match = byKey.get(entryKey(line.date, line.amount));
    verdicts.set(
      line.index,
      match ? { status: 'duplicate', existingDescription: match.description } : { status: 'new' },
    );
  }
  return verdicts;
}
