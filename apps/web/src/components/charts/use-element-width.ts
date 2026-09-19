import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * Largura em px de um elemento, acompanhando redimensionamentos (ResizeObserver).
 * Usado pelos gráficos em SVG próprio, que não passam pelo ResponsiveContainer do Recharts.
 * Antes da primeira medição (e no jsdom, que não mede nada) vale `fallback`.
 */
export function useElementWidth(ref: RefObject<HTMLElement | null>, fallback = 800): number {
  const [width, setWidth] = useState(fallback);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const next = element.getBoundingClientRect().width;
      if (next > 0) setWidth(next);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}
