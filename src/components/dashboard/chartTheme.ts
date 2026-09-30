/**
 * Tokens de gráfico do VINTE.
 *
 * São referências a variáveis CSS, não hexes: o SVG resolve `var(--x)` em
 * `fill`/`stroke` na hora de pintar, então trocar o tema repinta os gráficos
 * sem re-renderizar nada no React.
 *
 * As duas séries usam azul e dourado — não o verde/vermelho habitual de
 * finanças, nem o verde/dourado da marca. Ambos os pares colapsam em
 * protanopia: verde↔dourado mede ΔE 5.4, abaixo do piso de 8. Azul↔dourado
 * mede ΔE 24.5 no tema claro e 20.6 no escuro.
 *
 * Cada tema tem seus próprios degraus (ver `index.css`), validados contra o
 * fundo em que realmente aparecem — o escuro não é uma inversão do claro.
 */
export const CHART_COLORS = {
  income: 'var(--vinte-series-1)',
  expense: 'var(--vinte-series-2)',
  single: 'var(--vinte-series-1)',
  grid: 'var(--vinte-grid)',
  axis: 'var(--vinte-line)',
  muted: 'var(--vinte-ink-3)',
  surface: 'var(--vinte-surface)',
  /** Realce sob a barra em hover — precisa ser translúcido para não apagar o mark. */
  cursor: 'color-mix(in srgb, var(--vinte-ink) 6%, transparent)',
} as const;

export const AXIS_TICK = {
  fill: CHART_COLORS.muted,
  fontSize: 12,
} as const;
