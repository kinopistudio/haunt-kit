import type { Surface } from '../../src/render/surface';

export type Call = [name: string, ...args: unknown[]];

/** A 2D context that records every call and every property it is given. Gradients and text measures return stubs. */
export function fakeContext(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = [];
  const state: Record<string, unknown> = { globalCompositeOperation: 'source-over', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '10px sans-serif' };
  const ctx = new Proxy(state, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        calls.push([prop, ...args]);
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return { addColorStop: (...a: unknown[]) => calls.push(['addColorStop', ...a]) };
        if (prop === 'measureText') return { width: String(args[0]).length * 6 };
        return undefined;
      };
    },
    set(target, prop: string, value) {
      target[prop] = value;
      calls.push([`set:${prop}`, value]);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

export interface FakeSurface extends Surface {
  ctx: CanvasRenderingContext2D;
  calls: Call[];
}

export function fakeSurface(): FakeSurface {
  const { ctx, calls } = fakeContext();
  return { width: 0, height: 0, ctx, calls, getContext: () => ctx };
}

export const names = (calls: Call[]): string[] => calls.map((c) => c[0]);
