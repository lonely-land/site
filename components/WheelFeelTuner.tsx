'use client';

import { useEffect, useState } from 'react';
import { WHEEL_GESTURE, tuneWheelGesture } from '../lib/wheel-gesture.mjs';

/**
 * 手感调参面板：只在地址带 `?feel=1` 时出现，正式页面（不带参数）不渲染任何东西。
 *
 * 用途：滚轮/触控板的手感是"体感"问题，与其隔空猜参数，不如让你直接点着试。
 * 三个档只改"推多远算一屏"和"多密才算连续流"，改完立刻生效（组件都是调用时读常量）。
 *
 * 面板右下角那行数字是**你设备真实的事件流**：几发、共多少像素、平均间隔多少毫秒 ——
 * 把它报给我，我就能把这台机器的参数一次调准。
 */
type PresetKey = 'A' | 'B' | 'C';

const PRESETS: Record<PresetKey, { label: string; hint: string; values: Record<string, number> }> = {
  A: {
    label: 'A 轻',
    hint: '一推就动（32px→24px）',
    values: { triggerPx: 24, latchMs: 50, notchGapMs: 25, notchMinPx: 45 },
  },
  B: {
    label: 'B 中（默认）',
    hint: '推一下换一屏（32px）',
    values: { triggerPx: 32, latchMs: 50, notchGapMs: 25, notchMinPx: 45 },
  },
  C: {
    label: 'C 跟手',
    hint: '每发都算一格（最灵敏，容易划过头）',
    values: { triggerPx: 18, latchMs: 40, notchGapMs: 16, notchMinPx: 30 },
  },
};

export default function WheelFeelTuner() {
  const [visible, setVisible] = useState(false);
  const [preset, setPreset] = useState<PresetKey>('B');
  const [stats, setStats] = useState('滑一下试试，这里会显示你设备的事件流');
  const [applied, setApplied] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.location.search.includes('feel')) return;
    setVisible(true);
  }, []);

  useEffect(() => {
    if (!visible) return;
    let events: Array<[number, number]> = [];
    const onWheel = (e: WheelEvent) => {
      events.push([performance.now(), Math.abs(e.deltaY)]);
    };
    window.addEventListener('wheel', onWheel, { capture: true, passive: true });
    const id = window.setInterval(() => {
      const now = performance.now();
      events = events.filter(([t]) => now - t < 700);
      if (events.length === 0) return;
      const gaps: number[] = [];
      for (let i = 1; i < events.length; i++) gaps.push(events[i][0] - events[i - 1][0]);
      const avg = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0;
      const total = Math.round(events.reduce((a, [, d]) => a + d, 0));
      setStats(`最近 0.7s：${events.length} 发 / 共 ${total}px / 间隔 ${avg}ms`);
    }, 250);
    return () => {
      window.removeEventListener('wheel', onWheel, { capture: true });
      window.clearInterval(id);
    };
  }, [visible]);

  if (!visible) return null;

  const pick = (key: PresetKey) => {
    tuneWheelGesture(PRESETS[key].values);
    setPreset(key);
    setApplied(
      `已应用：阈值 ${WHEEL_GESTURE.triggerPx}px / 连续流窗 ${WHEEL_GESTURE.latchMs}ms / 鼠标格间隔 ${WHEEL_GESTURE.notchGapMs}ms`,
    );
  };

  return (
    <div
      data-wheel-feel-tuner
      style={{
        position: 'fixed',
        right: 12,
        bottom: 12,
        zIndex: 9999,
        width: 268,
        padding: '10px 12px',
        borderRadius: 10,
        background: 'rgba(12,12,14,0.92)',
        color: '#f2f2f2',
        font: '12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
        boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
      }}
    >
      <div style={{ opacity: 0.7, marginBottom: 6 }}>滚动手感（?feel=1）</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {(Object.keys(PRESETS) as PresetKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => pick(key)}
            style={{
              flex: 1,
              padding: '6px 0',
              borderRadius: 6,
              cursor: 'pointer',
              border: '1px solid ' + (preset === key ? '#7cc4ff' : 'rgba(255,255,255,0.25)'),
              background: preset === key ? 'rgba(124,196,255,0.18)' : 'transparent',
              color: 'inherit',
              font: 'inherit',
            }}
          >
            {PRESETS[key].label}
          </button>
        ))}
      </div>
      <div style={{ opacity: 0.6, marginTop: 5 }}>{PRESETS[preset].hint}</div>
      <div style={{ marginTop: 6, opacity: 0.85 }}>{stats}</div>
      {applied ? <div style={{ marginTop: 4, color: '#7cc4ff' }}>{applied}</div> : null}
    </div>
  );
}
