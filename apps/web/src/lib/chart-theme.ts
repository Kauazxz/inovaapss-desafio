/**
 * Tokens de visualização de dados — materialização de docs/DATAVIZ.md (seção 2) para o Recharts
 * e para os gráficos em SVG próprio.
 *
 * Regra: este arquivo é a ÚNICA fonte de cor dos gráficos. Nenhum componente em
 * src/components/charts escreve hex direto. Mudou um valor aqui? Refaça a validação de cor
 * descrita em DATAVIZ.md §2.1 e atualize a tabela de lá.
 */
import { useSyncExternalStore } from 'react';

import {
  classifyHealth,
  HEALTH_CLASS_LABELS,
  HEALTH_CLASSES,
  type ClassBand,
  type HealthClass,
  type HealthThresholds,
  type ProjectionConfidence,
} from '@inovaapss/shared';

export type ChartMode = 'light' | 'dark';

/** Paleta de um modo (claro ou escuro). Nomes seguem a tabela de DATAVIZ.md §2.1. */
export interface ChartPalette {
  /** fundo do gráfico */
  surface: string;
  /** texto principal (título, valores) */
  ink: string;
  /** subtítulo, anotações */
  inkSecondary: string;
  /** rótulos de eixo, ticks */
  muted: string;
  /** marca padrão: barras/linhas sem destaque, "os outros", a média */
  neutral: string;
  /** marca neutra com mais peso (ex.: health atual no dumbbell) */
  neutralStrong: string;
  /** hairline de grid e eixo */
  grid: string;
  /** a única cor de destaque */
  accent: string;
  /** segundo tom do destaque (projeção, área a 10 %) */
  accentSoft: string;
  /** cores reservadas às classes de saúde — nunca sozinhas, sempre com o nome em texto */
  classes: Record<HealthClass, string>;
}

export const CHART_PALETTES: Readonly<Record<ChartMode, ChartPalette>> = {
  light: {
    surface: '#fcfcfb',
    ink: '#0b0b0b',
    inkSecondary: '#52514e',
    muted: '#898781',
    neutral: '#c3c2b7',
    neutralStrong: '#898781',
    grid: '#e1e0d9',
    accent: '#2a78d6',
    accentSoft: '#86b6ef',
    classes: {
      NORMAL: '#0ca30c',
      ATTENTION: '#fab219',
      RISK: '#ec835a',
      CRITICAL: '#d03b3b',
    },
  },
  dark: {
    surface: '#1a1a19',
    ink: '#ffffff',
    inkSecondary: '#c3c2b7',
    muted: '#898781',
    neutral: '#52514e',
    neutralStrong: '#898781',
    grid: '#2c2c2a',
    accent: '#3987e5',
    accentSoft: '#1c5cab',
    classes: {
      NORMAL: '#0ca30c',
      ATTENTION: '#fab219',
      RISK: '#ec835a',
      CRITICAL: '#d03b3b',
    },
  },
};

/** Tipografia dos gráficos (DATAVIZ.md §2.2). Tamanhos em px. */
export const CHART_TYPOGRAPHY = {
  fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  title: { size: 16, weight: 600 },
  subtitle: { size: 13, weight: 400 },
  bigNumber: { size: 36, weight: 600 },
  directLabel: { size: 12, weight: 500 },
  annotation: { size: 12, weight: 400 },
  tick: { size: 11, weight: 400 },
} as const;

/** Marcas e tamanhos mínimos (DATAVIZ.md §2.3). Valores em px, exceto opacidades. */
export const CHART_MARKS = {
  /** espessura máxima de uma barra */
  barMaxThickness: 24,
  /** canto arredondado só na ponta do dado */
  barRadius: 4,
  /** espaço de fundo entre barras que se tocam */
  barGap: 2,
  lineWidth: 2,
  pointDiameter: 8,
  pointRing: 2,
  referenceLineWidth: 1,
  /** altura mínima de um gráfico */
  minHeight: 160,
  /** altura extra por linha em barras horizontais */
  rowHeight: 24,
  /** área mínima de clique/hover */
  hitArea: 24,
  /** faixa-alvo / faixas de classe no fundo: cor da classe a 8 % */
  bandFillOpacity: 0.08,
  /** área sob linha: cor da série a 10 % */
  areaOpacity: 0.1,
  /** ao recarregar dados, o gráfico anterior fica a 60 % (nunca piscar um skeleton — §2.4) */
  reloadingOpacity: 0.6,
  /** espessura do segmento do dumbbell (atual → projetado) */
  dumbbellStroke: 3,
  /** tamanho da ponta de seta do dumbbell */
  arrowSize: 6,
} as const;

/** Linhas de referência padrão do eixo de health (§7 — thresholds podem vir da organização). */
export const DEFAULT_HEALTH_THRESHOLDS: HealthThresholds = {
  attention: 80,
  risk: 60,
  critical: 40,
};

/** Faixa-alvo padrão das barras por dimensão (Normal: 80–100). */
export const DEFAULT_TARGET_BAND = { min: 80, max: 100 } as const;

/** Converte `#rrggbb` em `rgba(r, g, b, alpha)` — usado para `band.fill` e áreas. */
export function withOpacity(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const value = Number.parseInt(clean, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Cor da faixa de fundo de uma classe (`band.fill`). */
export function bandFill(palette: ChartPalette, healthClass: HealthClass): string {
  return withOpacity(palette.classes[healthClass], CHART_MARKS.bandFillOpacity);
}

/** Nome da classe em texto — a cor de classe nunca vai sozinha (DATAVIZ.md §1.4). */
export function healthClassLabel(healthClass: HealthClass): string {
  return HEALTH_CLASS_LABELS[healthClass];
}

/** Rótulo em português da confiança da projeção (DATAVIZ.md §5.2). */
export const PROJECTION_CONFIDENCE_TEXT: Readonly<Record<ProjectionConfidence, string>> = {
  low: 'confiança baixa',
  medium: 'confiança média',
  high: 'confiança alta',
};

/** Uma faixa de classe no eixo de health: de `from` (inclusive) até `to`. */
export interface HealthBand {
  healthClass: HealthClass;
  from: number;
  to: number;
}

/** Faixas do eixo 0–100 a partir dos thresholds vigentes, de Crítico a Normal (esquerda → direita). */
export function healthBandsFromThresholds(thresholds: HealthThresholds): HealthBand[] {
  return [
    { healthClass: 'CRITICAL', from: 0, to: thresholds.critical },
    { healthClass: 'RISK', from: thresholds.critical, to: thresholds.risk },
    { healthClass: 'ATTENTION', from: thresholds.risk, to: thresholds.attention },
    { healthClass: 'NORMAL', from: thresholds.attention, to: 100 },
  ];
}

/** Thresholds no formato de faixas do `classifyHealth` (§7). */
export function bandsFromThresholds(thresholds: HealthThresholds): ClassBand<HealthClass>[] {
  return [
    { class: 'NORMAL', min: thresholds.attention },
    { class: 'ATTENTION', min: thresholds.risk },
    { class: 'RISK', min: thresholds.critical },
    { class: 'CRITICAL', min: 0 },
  ];
}

/** Classe de um health pelos thresholds vigentes (não os padrões). */
export function classifyHealthWith(health: number, thresholds: HealthThresholds): HealthClass {
  return classifyHealth(health, bandsFromThresholds(thresholds));
}

/** Ordem de exibição das classes em rankings de distribuição: Crítico no topo (DATAVIZ.md §4.2). */
export const HEALTH_CLASSES_WORST_FIRST: readonly HealthClass[] = [...HEALTH_CLASSES].reverse();

// ---------- Modo claro/escuro ----------

function readMode(): ChartMode {
  if (typeof document === 'undefined') return 'light';
  const forced = document.documentElement.dataset['theme'];
  if (forced === 'dark') return 'dark';
  if (forced === 'light') return 'light';
  if (typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function subscribeMode(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', onChange);
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => {
    media.removeEventListener('change', onChange);
    observer.disconnect();
  };
}

/** Modo atual (segue `[data-theme]` no <html> e, na falta dele, `prefers-color-scheme`). */
export function useChartMode(): ChartMode {
  return useSyncExternalStore(subscribeMode, readMode, () => 'light');
}

/** Paleta do modo atual — o que os componentes de gráfico consomem. */
export function useChartPalette(): ChartPalette {
  return CHART_PALETTES[useChartMode()];
}
