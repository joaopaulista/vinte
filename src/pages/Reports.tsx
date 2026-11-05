import { Fragment, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight, Download, FileBarChart } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Spinner } from '@/components/common/Spinner';
import { EmptyState } from '@/components/common/EmptyState';
import { CashflowChart } from '@/components/dashboard/CashflowChart';
import { DescriptionLabel } from '@/components/transactions/DescriptionLabel';
import { OwnerFilter, filterByOwner, useOwnerFilter } from '@/components/owners/OwnerFilter';
import { useOwners } from '@/hooks/useOwners';
import { useTransactions } from '@/hooks/useTransactions';
import { fetchAccounts } from '@/services/accountsService';
import { isTransfer } from '@/utils/insights';
import { formatCurrency, formatDate, parseDateOnly } from '@/utils/format';
import {
  PERIOD_PRESETS,
  downloadCsv,
  groupByCategory,
  groupByPeriod,
  presetRange,
  suggestGranularity,
  toCsv,
} from '@/utils/reports';
import type { CategoryRow, Granularity, PeriodPreset } from '@/utils/reports';
import type { AccountWithConnection, TransactionWithRelations } from '@/types';

type Report = 'expense' | 'income' | 'period' | 'category';

const REPORTS: { value: Report; label: string; hint: string }[] = [
  { value: 'expense', label: 'Gastos', hint: 'Para onde foi o dinheiro: despesas por categoria e os maiores gastos.' },
  { value: 'income', label: 'Ganhos', hint: 'De onde veio o dinheiro: receitas por categoria e as maiores entradas.' },
  { value: 'period', label: 'Por período', hint: 'Entradas, saídas e saldo dia a dia, por semana ou por mês.' },
  { value: 'category', label: 'Por categoria', hint: 'Entradas, saídas e saldo de cada categoria e subcategoria.' },
];

const GRANULARITY_LABELS: Record<Granularity, string> = { day: 'Dia', week: 'Semana', month: 'Mês' };

/** Meses (com fração) cobertos pelo intervalo, para a média mensal. */
function monthsIn(from: string, to: string): number {
  const start = parseDateOnly(from);
  const end = parseDateOnly(to);
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
  return Math.max(1, months);
}

export default function Reports() {
  const [report, setReport] = useState<Report>('expense');
  const [preset, setPreset] = useState<PeriodPreset>('this-month');
  const [custom, setCustom] = useState(() => presetRange('this-month'));
  const [accountId, setAccountId] = useState('all');
  const [includePending, setIncludePending] = useState(false);
  const [ignoreTransfers, setIgnoreTransfers] = useState(true);
  const [granularity, setGranularity] = useState<Granularity | 'auto'>('auto');
  const [accounts, setAccounts] = useState<AccountWithConnection[]>([]);
  const { owners, loading: ownersLoading } = useOwners();
  const [ownerFilter, setOwnerFilter] = useOwnerFilter(owners, ownersLoading);

  useEffect(() => {
    fetchAccounts().then(setAccounts).catch(() => setAccounts([]));
  }, []);

  const range = preset === 'custom' ? custom : presetRange(preset);
  const validRange = Boolean(range.from && range.to && range.from <= range.to);

  const { transactions: fetched, loading, error } = useTransactions({
    status: includePending ? 'all' : 'approved',
    from: validRange ? range.from : null,
    to: validRange ? range.to : null,
  });

  const transactions = useMemo(() => {
    const scoped = filterByOwner(fetched, ownerFilter).filter(
      (transaction) =>
        // Reprovada nunca entra: é o jeito de tirar dos números o que não é receita nem despesa.
        transaction.reconciliation_status !== 'rejected' &&
        (accountId === 'all' || transaction.account_id === accountId) &&
        !(ignoreTransfers && isTransfer(transaction)),
    );
    return scoped;
  }, [fetched, ownerFilter, accountId, ignoreTransfers]);

  const accountOptions = useMemo(
    () =>
      ownerFilter === 'all'
        ? accounts
        : accounts.filter((account) => (ownerFilter === 'none' ? !account.owner_id : account.owner_id === ownerFilter)),
    [accounts, ownerFilter],
  );

  const effectiveGranularity = granularity === 'auto' ? suggestGranularity(range.from, range.to) : granularity;
  const current = REPORTS.find((item) => item.value === report) ?? REPORTS[0];
  const periodLabel =
    preset === 'custom'
      ? `${formatDate(range.from)} a ${formatDate(range.to)}`
      : (PERIOD_PRESETS.find((item) => item.value === preset)?.label ?? '');

  return (
    <div className="page">
      <PageHeader title="Relatórios" description={current.hint} />

      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-line" role="tablist" aria-label="Tipo de relatório">
        {REPORTS.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={report === item.value}
            onClick={() => setReport(item.value)}
            className={`-mb-px min-h-11 shrink-0 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors sm:px-4 ${
              report === item.value ? 'border-accent text-ink' : 'border-transparent text-ink-2 hover:text-ink'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="card flex shrink-0 flex-wrap items-end gap-3 p-3">
        <Field label="Período" id="report-period">
          <select
            id="report-period"
            className="field w-auto py-1.5"
            value={preset}
            onChange={(event) => {
              const next = event.target.value as PeriodPreset;
              if (next === 'custom') setCustom(range);
              setPreset(next);
            }}
          >
            {PERIOD_PRESETS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
        {preset === 'custom' && (
          <>
            <Field label="De" id="report-from">
              <input
                id="report-from"
                type="date"
                className="field w-auto py-1.5"
                value={custom.from}
                onChange={(event) => setCustom({ ...custom, from: event.target.value })}
              />
            </Field>
            <Field label="Até" id="report-to">
              <input
                id="report-to"
                type="date"
                className="field w-auto py-1.5"
                value={custom.to}
                onChange={(event) => setCustom({ ...custom, to: event.target.value })}
              />
            </Field>
          </>
        )}
        {owners.length > 0 && (
          <div className="flex flex-col gap-1">
            <OwnerFilter
              owners={owners}
              value={ownerFilter}
              onChange={(value) => {
                setOwnerFilter(value);
                setAccountId('all');
              }}
              id="report-owner"
            />
          </div>
        )}
        <Field label="Conta" id="report-account">
          <select
            id="report-account"
            className="field w-auto max-w-56 py-1.5"
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
          >
            <option value="all">Todas</option>
            {accountOptions.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name ?? 'Conta'}
                {account.is_manual ? ' (manual)' : ''}
              </option>
            ))}
          </select>
        </Field>
        {report === 'period' && (
          <Field label="Agrupar por" id="report-granularity">
            <select
              id="report-granularity"
              className="field w-auto py-1.5"
              value={granularity}
              onChange={(event) => setGranularity(event.target.value as Granularity | 'auto')}
            >
              <option value="auto">Automático ({GRANULARITY_LABELS[suggestGranularity(range.from, range.to)].toLowerCase()})</option>
              <option value="day">Dia</option>
              <option value="week">Semana</option>
              <option value="month">Mês</option>
            </select>
          </Field>
        )}
        <div className="flex flex-col gap-1.5 pb-1 text-sm text-ink-2">
          <Check label="Incluir pendentes" checked={includePending} onChange={setIncludePending} />
          <Check label="Ignorar transferências" checked={ignoreTransfers} onChange={setIgnoreTransfers} />
        </div>
      </div>

      {!validRange ? (
        <div className="card p-4 text-sm text-danger-ink">A data inicial precisa ser antes da final.</div>
      ) : loading ? (
        <Spinner label="Montando o relatório…" />
      ) : error ? (
        <div className="card border-danger/30 bg-danger-surface p-4 text-sm text-danger-ink">{error}</div>
      ) : transactions.length === 0 ? (
        <div className="card page-fill justify-center">
          <EmptyState
            icon={FileBarChart}
            title="Nada neste recorte"
            description="Mude o período ou os filtros. Por padrão só entram transações aprovadas."
          />
        </div>
      ) : report === 'expense' || report === 'income' ? (
        <FlowReport
          kind={report}
          transactions={transactions}
          months={monthsIn(range.from, range.to)}
          periodLabel={periodLabel}
        />
      ) : report === 'period' ? (
        <PeriodReport
          transactions={transactions}
          granularity={effectiveGranularity}
          from={range.from}
          to={range.to}
          periodLabel={periodLabel}
        />
      ) : (
        <CategoryReport transactions={transactions} periodLabel={periodLabel} />
      )}
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-ink-2">
        {label}
      </label>
      {children}
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        className="h-4 w-4 accent-[var(--vinte-accent)]"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function Kpi({ label, value, tone = 'text-ink', hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-sm font-medium text-ink-2">{label}</p>
      <p className={`num mt-1 text-xl font-semibold ${tone}`}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="btn-secondary min-h-8 shrink-0 px-3 py-1 text-xs" onClick={onClick}>
      <Download className="h-3.5 w-3.5" aria-hidden />
      Exportar CSV
    </button>
  );
}

function fileSlug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** Gastos ou ganhos: totais, ranking por categoria e os maiores lançamentos. */
function FlowReport({
  kind,
  transactions,
  months,
  periodLabel,
}: {
  kind: 'expense' | 'income';
  transactions: TransactionWithRelations[];
  months: number;
  periodLabel: string;
}) {
  const isExpense = kind === 'expense';
  const flow = useMemo(
    () => transactions.filter((transaction) => (isExpense ? transaction.amount < 0 : transaction.amount > 0)),
    [transactions, isExpense],
  );
  const rows = useMemo(() => groupByCategory(flow), [flow]);
  const total = flow.reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
  const biggest = useMemo(
    () => [...flow].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 10),
    [flow],
  );
  const noun = isExpense ? 'gastos' : 'ganhos';
  const amountOf = (row: CategoryRow) => (isExpense ? row.expense : row.income);

  function exportCsv() {
    const lines: (string | number)[][] = [];
    for (const row of rows) {
      lines.push([row.name, '', amountOf(row), row.count, total ? (amountOf(row) / total) * 100 : 0]);
      for (const child of row.children) {
        lines.push([row.name, child.name, amountOf(child), child.count, total ? (amountOf(child) / total) * 100 : 0]);
      }
    }
    downloadCsv(
      `vinte-${noun}-${fileSlug(periodLabel)}.csv`,
      toCsv(['Categoria', 'Subcategoria', 'Valor (R$)', 'Lançamentos', '% do total'], lines),
    );
  }

  if (flow.length === 0) {
    return (
      <div className="card page-fill justify-center">
        <EmptyState icon={FileBarChart} title={`Nenhum ${isExpense ? 'gasto' : 'ganho'} neste recorte`} description="Mude o período ou os filtros." />
      </div>
    );
  }

  return (
    <div className="page-fill lg:overflow-y-auto">
      <div className="grid shrink-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label={`Total de ${noun}`} value={formatCurrency(total)} tone={isExpense ? 'text-ink' : 'text-success-ink'} hint={periodLabel} />
        <Kpi label="Média por mês" value={formatCurrency(total / months)} hint={`${months} ${months === 1 ? 'mês' : 'meses'}`} />
        <Kpi label="Lançamentos" value={String(flow.length)} hint={`Média de ${formatCurrency(total / flow.length)}`} />
        <Kpi
          label={isExpense ? 'Maior gasto' : 'Maior entrada'}
          value={formatCurrency(Math.abs(biggest[0]?.amount ?? 0))}
          hint={biggest[0]?.description ?? undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <section className="panel">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-ink">{isExpense ? 'Gastos' : 'Ganhos'} por categoria</h2>
              <p className="text-xs text-ink-2">Clique numa categoria para ver as subcategorias</p>
            </div>
            <ExportButton onClick={exportCsv} />
          </div>
          <ShareTable rows={rows} total={total} amountOf={amountOf} tone={isExpense ? 'bg-coral' : 'bg-mint'} />
        </section>

        <section className="panel">
          <h2 className="mb-3 text-sm font-semibold text-ink">{isExpense ? 'Maiores gastos' : 'Maiores entradas'}</h2>
          <ul className="divide-y divide-line">
            {biggest.map((transaction) => (
              <li key={transaction.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <DescriptionLabel
                    description={transaction.description}
                    installmentNumber={transaction.installment_number}
                    totalInstallments={transaction.total_installments}
                    className="text-sm"
                  />
                  <p className="truncate text-xs text-ink-2">
                    {formatDate(transaction.transaction_date)}
                    {transaction.category ? ` · ${transaction.category.name}` : ''}
                    {transaction.account?.name ? ` · ${transaction.account.name}` : ''}
                  </p>
                </div>
                <span className={`num text-sm font-medium ${isExpense ? 'text-ink' : 'text-success-ink'}`}>
                  {formatCurrency(Math.abs(transaction.amount))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

/** Tabela de participação com barra e subcategorias que abrem por baixo. */
function ShareTable({
  rows,
  total,
  amountOf,
  tone,
}: {
  rows: CategoryRow[];
  total: number;
  amountOf: (row: CategoryRow) => number;
  tone: string;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const sorted = [...rows].sort((a, b) => amountOf(b) - amountOf(a));

  function toggle(id: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const line = (row: CategoryRow, child = false) => {
    const value = amountOf(row);
    const share = total ? value / total : 0;
    const expandable = !child && row.children.length > 0;
    return (
      <tr key={row.id} className={child ? 'bg-surface-2/50' : ''}>
        <td className={`py-2 pr-3 ${child ? 'pl-8' : ''}`}>
          {expandable ? (
            <button
              type="button"
              onClick={() => toggle(row.id)}
              className="inline-flex items-center gap-1 text-left text-ink hover:text-accent"
              aria-expanded={open.has(row.id)}
            >
              {open.has(row.id) ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
              {row.name}
            </button>
          ) : (
            <span className={child ? 'text-ink-2' : 'pl-[18px] text-ink'}>{row.name}</span>
          )}
        </td>
        <td className="hidden w-1/3 py-2 pr-3 sm:table-cell">
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <div className={`h-full rounded-full ${tone} ${child ? 'opacity-60' : ''}`} style={{ width: `${share * 100}%` }} />
          </div>
        </td>
        <td className="num py-2 pr-3 text-right text-xs text-ink-2">{(share * 100).toFixed(1)}%</td>
        <td className="num py-2 text-right font-medium whitespace-nowrap text-ink">{formatCurrency(value)}</td>
      </tr>
    );
  };

  return (
    <div className="scroll-y lg:flex-1">
      <table className="w-full text-sm">
        <thead className="sr-only">
          <tr>
            <th>Categoria</th>
            <th>Participação</th>
            <th>%</th>
            <th>Valor</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {sorted.map((row) => (
            <Fragment key={row.id}>
              {line(row)}
              {open.has(row.id) && row.children.map((child) => line(child, true))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Entradas, saídas e saldo por dia, semana ou mês. */
function PeriodReport({
  transactions,
  granularity,
  from,
  to,
  periodLabel,
}: {
  transactions: TransactionWithRelations[];
  granularity: Granularity;
  from: string;
  to: string;
  periodLabel: string;
}) {
  const rows = useMemo(() => groupByPeriod(transactions, granularity, from, to), [transactions, granularity, from, to]);
  const income = rows.reduce((sum, row) => sum + row.income, 0);
  const expense = rows.reduce((sum, row) => sum + row.expense, 0);

  function exportCsv() {
    downloadCsv(
      `vinte-periodo-${fileSlug(periodLabel)}.csv`,
      toCsv(
        [GRANULARITY_LABELS[granularity], 'Entradas (R$)', 'Saídas (R$)', 'Saldo (R$)', 'Acumulado (R$)', 'Lançamentos'],
        rows.map((row) => [row.key, row.income, row.expense, row.balance, row.cumulative, String(row.count)]),
      ),
    );
  }

  return (
    <div className="page-fill lg:overflow-y-auto">
      <div className="grid shrink-0 gap-4 sm:grid-cols-3">
        <Kpi label="Entradas" value={formatCurrency(income)} tone="text-success-ink" hint={periodLabel} />
        <Kpi label="Saídas" value={formatCurrency(expense)} hint={periodLabel} />
        <Kpi
          label="Saldo"
          value={formatCurrency(income - expense)}
          tone={income - expense >= 0 ? 'text-success-ink' : 'text-danger-ink'}
          hint={income > 0 ? `${(((income - expense) / income) * 100).toFixed(0)}% da receita sobrou` : undefined}
        />
      </div>

      <section className="panel shrink-0">
        <h2 className="text-sm font-semibold text-ink">Entradas e saídas por {GRANULARITY_LABELS[granularity].toLowerCase()}</h2>
        <div className="h-64">
          <CashflowChart data={rows} />
        </div>
      </section>

      <section className="panel shrink-0">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">Detalhe</h2>
          <ExportButton onClick={exportCsv} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold tracking-wide text-ink-2 uppercase">
                <th className="py-2 pr-3">{GRANULARITY_LABELS[granularity]}</th>
                <th className="py-2 pr-3 text-right">Entradas</th>
                <th className="py-2 pr-3 text-right">Saídas</th>
                <th className="py-2 pr-3 text-right">Saldo</th>
                <th className="py-2 text-right">Acumulado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={row.key} className={row.count === 0 ? 'text-ink-3' : ''}>
                  <td className="py-2 pr-3 whitespace-nowrap first-letter:uppercase">{row.label}</td>
                  <td className="num py-2 pr-3 text-right text-success-ink">{formatCurrency(row.income)}</td>
                  <td className="num py-2 pr-3 text-right">{formatCurrency(row.expense)}</td>
                  <td className={`num py-2 pr-3 text-right font-medium ${row.balance < 0 ? 'text-danger-ink' : ''}`}>
                    {formatCurrency(row.balance)}
                  </td>
                  <td className="num py-2 text-right text-ink-2">{formatCurrency(row.cumulative)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/** Entradas, saídas e saldo por categoria e subcategoria. */
function CategoryReport({ transactions, periodLabel }: { transactions: TransactionWithRelations[]; periodLabel: string }) {
  const rows = useMemo(() => groupByCategory(transactions), [transactions]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const totalExpense = rows.reduce((sum, row) => sum + row.expense, 0);
  const totalIncome = rows.reduce((sum, row) => sum + row.income, 0);

  function toggle(id: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exportCsv() {
    const lines: (string | number)[][] = [];
    for (const row of rows) {
      lines.push([row.name, '', row.income, row.expense, row.net, String(row.count)]);
      for (const child of row.children) lines.push([row.name, child.name, child.income, child.expense, child.net, String(child.count)]);
    }
    downloadCsv(
      `vinte-categorias-${fileSlug(periodLabel)}.csv`,
      toCsv(['Categoria', 'Subcategoria', 'Entradas (R$)', 'Saídas (R$)', 'Saldo (R$)', 'Lançamentos'], lines),
    );
  }

  const line = (row: CategoryRow, child = false) => (
    <tr key={row.id} className={child ? 'bg-surface-2/50' : ''}>
      <td className={`py-2 pr-3 ${child ? 'pl-8 text-ink-2' : ''}`}>
        {!child && row.children.length > 0 ? (
          <button
            type="button"
            onClick={() => toggle(row.id)}
            className="inline-flex items-center gap-1 text-left text-ink hover:text-accent"
            aria-expanded={open.has(row.id)}
          >
            {open.has(row.id) ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
            {row.name}
          </button>
        ) : (
          <span className={child ? '' : 'pl-[18px] text-ink'}>{row.name}</span>
        )}
      </td>
      <td className="num py-2 pr-3 text-right text-success-ink">{row.income ? formatCurrency(row.income) : '—'}</td>
      <td className="num py-2 pr-3 text-right">{row.expense ? formatCurrency(row.expense) : '—'}</td>
      <td className={`num py-2 pr-3 text-right font-medium ${row.net < 0 ? 'text-ink' : 'text-success-ink'}`}>
        {formatCurrency(row.net)}
      </td>
      <td className="num py-2 text-right text-xs text-ink-2">
        {row.expense && totalExpense ? `${((row.expense / totalExpense) * 100).toFixed(1)}%` : '—'}
      </td>
    </tr>
  );

  return (
    <div className="page-fill lg:overflow-y-auto">
      <div className="grid shrink-0 gap-4 sm:grid-cols-3">
        <Kpi label="Entradas" value={formatCurrency(totalIncome)} tone="text-success-ink" hint={periodLabel} />
        <Kpi label="Saídas" value={formatCurrency(totalExpense)} hint={periodLabel} />
        <Kpi label="Categorias com movimento" value={String(rows.length)} />
      </div>
      <section className="panel shrink-0">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Por categoria</h2>
            <p className="text-xs text-ink-2">Clique numa categoria para ver as subcategorias</p>
          </div>
          <ExportButton onClick={exportCsv} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold tracking-wide text-ink-2 uppercase">
                <th className="py-2 pr-3">Categoria</th>
                <th className="py-2 pr-3 text-right">Entradas</th>
                <th className="py-2 pr-3 text-right">Saídas</th>
                <th className="py-2 pr-3 text-right">Saldo</th>
                <th className="py-2 text-right">% dos gastos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <Fragment key={row.id}>
                  {line(row)}
                  {open.has(row.id) && row.children.map((child) => line(child, true))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
