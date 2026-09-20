/**
 * Contratos do Canvas de Decisão do Agente IA.
 *
 * O modelo escolhe apenas uma perspectiva permitida. Os valores e séries são sempre montados
 * pela API a partir dos snapshots do tenant; nenhum número gerado pelo modelo entra no canvas.
 */
import type { ForecastChartData, HealthThresholds } from './dashboard/forecast.js';
import type {
  ClassDistributionItem,
  DimensionHealth,
  HealthTimeline,
} from './dashboard/general.js';
import type { RankingRow } from './dashboard/risk.js';

export const ASSISTANT_CANVAS_PRESETS = [
  'risk',
  'revenue',
  'forecast',
  'dimensions',
  'portfolio',
] as const;

export type AssistantCanvasPreset = (typeof ASSISTANT_CANVAS_PRESETS)[number];

export type AssistantCanvasMetricFormat = 'integer' | 'currency' | 'score' | 'percent';
export type AssistantCanvasMetricTone = 'neutral' | 'attention' | 'risk' | 'critical';

export interface AssistantCanvasMetric {
  label: string;
  value: number;
  delta: number | null;
  format: AssistantCanvasMetricFormat;
  currency?: string;
  hint?: string;
  tone?: AssistantCanvasMetricTone;
}

export type AssistantCanvasWidget =
  | {
      type: 'metrics';
      title: string;
      items: AssistantCanvasMetric[];
    }
  | {
      type: 'forecast';
      data: ForecastChartData;
    }
  | {
      type: 'dimensions';
      dimensions: DimensionHealth[];
      targetBand: { min: number; max: number };
      thresholds: HealthThresholds;
    }
  | {
      type: 'timeline';
      timeline: HealthTimeline;
      thresholds: HealthThresholds;
    }
  | {
      type: 'distribution';
      distribution: ClassDistributionItem[];
    }
  | {
      type: 'priorities';
      title: string;
      rows: RankingRow[];
    };

export interface AssistantCanvas {
  preset: AssistantCanvasPreset;
  title: string;
  summary: string;
  generatedAt: string;
  widgets: AssistantCanvasWidget[];
}
