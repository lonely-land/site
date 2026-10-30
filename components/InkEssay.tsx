'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import Link from 'next/link';
import {
  features,
  paragraphs,
  ui,
  type Feature,
  type Piece,
} from '@/content/essay';
import {
  charInk,
  DIM_COLOR,
  groupLines,
  holdInk,
  lineProgress,
  LIT_COLOR,
  nextOpen,
} from '@/lib/ink.mjs';
import settings from '@/settings.json';
import ContactIcon from './ContactIcon';
import styles from './InkEssay.module.css';

type InkNode = HTMLElement & { _feature?: string };

type LinkItem = {
  icon: string;
  name: string;
  url: string;
};

function Glyphs({
  text,
  featureId,
  className,
}: {
  text: string;
  featureId?: string;
  className?: string;
}) {
  const chars = Array.from(text);
  return (
    <span className={className}>
      {chars.map((char, index) => (
        <span
          key={`${char}-${index}`}
          data-ink=""
          data-feature={featureId}
          className={styles.glyph}
        >
          {char}
        </span>
      ))}
    </span>
  );
}

function FeatureCard({ feature }: { feature: Feature }) {
  const openProps = {
    className: styles.feature,
    'data-feature-root': feature.id,
    'data-open': 'false',
    'aria-expanded': false,
  };
  const body = (
    <>
      <span className={styles.pill}>
        <span className={styles.featureTitle}>
          {feature.icon ? <span className={styles.iconSlot}><img src={feature.icon} alt="" style={{ objectFit: feature.iconFit ?? 'cover' }} /></span> : null}
          <span className={styles.titleWord}><span className={styles.titleSizer} aria-hidden="true">{feature.title}</span><Glyphs text={feature.title} featureId={feature.id} className={styles.titleInk} /></span>
        </span>
      </span>{feature.suffix ? <Glyphs text={feature.suffix} /> : null}
    </>
  );

  if (feature.href) {
    return (
      <a
        {...openProps}
        href={feature.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${feature.title}（新标签页打开）`}
      >
        {body}
      </a>
    );
  }

  return <span {...openProps}>{body}</span>;
}

function renderPiece(piece: Piece, index: number) {
  if (piece.type === 'text') {
    return <Glyphs key={index} text={piece.text} />;
  }
  if (piece.type === 'link') {
    return (
      <a
        key={index}
        className={styles.term}
        href={piece.href}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Glyphs text={piece.text} />
      </a>
    );
  }
  const feature = features[piece.id];
  return <FeatureCard key={feature.id} feature={feature} />;
}

export default function InkEssay() {
  const rootRef = useRef<HTMLDivElement>(null);
  const links = settings.links as LinkItem[];

  // 首页把滚动锁在拨码轮上，这一页要自己滚
  useEffect(() => {
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const read = new WeakMap<HTMLElement, number>();
    let followUntil = 0;
    let frame = 0;

    const paint = (allowToggle: boolean) => {
      const glyphs = Array.from(root.querySelectorAll<InkNode>('[data-ink]'));
      const cards = Array.from(root.querySelectorAll<HTMLElement>('[data-feature-root]'));
      const reduced = motion.matches;

      if (reduced) {
        for (const glyph of glyphs) {
          glyph.style.color = LIT_COLOR;
          glyph.style.backgroundImage = '';
          glyph.style.backgroundClip = '';
          glyph.style.webkitBackgroundClip = '';
        }
        for (const card of cards) {
          card.dataset.open = 'true';
          card.setAttribute('aria-expanded', 'true');
        }
        root.dataset.scrolled = 'true';
        return false;
      }

      const viewportHeight = window.innerHeight;
      const measured = glyphs.map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          el,
          x: rect.left,
          y: rect.top,
          h: rect.height,
          feature: el.dataset.feature,
        };
      });
      const glyphHeight = measured.find((item) => item.h > 0)?.h ?? 24;
      const tolerance = Math.max(8, glyphHeight * 0.45);
      const lines = groupLines(measured, tolerance);
      const essay = root.querySelector('[data-essay]');
      const measuredStep = essay ? parseFloat(getComputedStyle(essay).lineHeight) : NaN;
      const lineStep = Number.isFinite(measuredStep) ? measuredStep : glyphHeight * 1.85;
      const totals = new Map<string, { sum: number; count: number }>();

      for (const line of lines) {
        const progress = lineProgress(line[0].y, viewportHeight, lineStep);
        line.forEach((item, index) => {
          const ink = holdInk(read.get(item.el) ?? 0, charInk(progress, index, line.length));
          read.set(item.el, ink);
          applyInk(item.el, ink);
          if (!item.feature) return;
          const bucket = totals.get(item.feature) ?? { sum: 0, count: 0 };
          bucket.sum += ink;
          bucket.count += 1;
          totals.set(item.feature, bucket);
        });
      }

      root.dataset.scrolled = window.scrollY > 28 ? 'true' : 'false';
      if (!allowToggle) return false;

      let changed = false;
      for (const card of cards) {
        const id = card.dataset.featureRoot;
        if (!id) continue;
        const bucket = totals.get(id);
        const ink = bucket && bucket.count > 0 ? bucket.sum / bucket.count : 0;
        const wasOpen = card.dataset.open === 'true';
        const open = nextOpen(wasOpen, ink);
        if (open === wasOpen) continue;
        card.dataset.open = open ? 'true' : 'false';
        card.setAttribute('aria-expanded', open ? 'true' : 'false');
        changed = true;
      }
      return changed;
    };

    const update = (allowToggle: boolean) => {
      const changed = paint(allowToggle);
      if (!changed) return;
      paint(false);
      followUntil = performance.now() + 920;
      if (!frame) frame = requestAnimationFrame(follow);
    };

    const follow = () => {
      frame = 0;
      paint(false);
      if (performance.now() < followUntil) {
        frame = requestAnimationFrame(follow);
      }
    };

    let queued = false;
    const requestUpdate = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        update(true);
      });
    };

    update(true);
    const onMotion = () => update(true);
    motion.addEventListener('change', onMotion);
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);
    const observer = new ResizeObserver(requestUpdate);
    observer.observe(root);

    return () => {
      motion.removeEventListener('change', onMotion);
      window.removeEventListener('scroll', requestUpdate);
      window.removeEventListener('resize', requestUpdate);
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={rootRef} className={styles.page} data-scrolled="false">
      <header className={styles.bar}>
        <Link href="/" className={styles.mark}>Lonely</Link>
      </header>
      <main className={styles.sheet}>
        <h1 className={styles.srOnly}>Lonely</h1>
        <p className={styles.srOnly}>
          向下滚动时，文字一行一行从左往右写完。读到一个名字时，它会在句子里收成一个词。
        </p>
        <article className={styles.essay} data-essay="">
          {paragraphs.map((pieces, index) => (
            <div className={styles.stanza} key={index}>
              {pieces.map(renderPiece)}
            </div>
          ))}
        </article>

        <footer className={styles.end}>
          <p className={styles.contactLabel}>Contact</p>
          <ul className={styles.contacts}>
            {links.map((item) => (
              <li key={item.url}>
                <a
                  href={item.url}
                  target={item.url.startsWith('mailto:') ? undefined : '_blank'}
                  rel={item.url.startsWith('mailto:') ? undefined : 'noopener noreferrer'}
                >
                  <ContactIcon name={item.icon} className={styles.contactIcon} />
                  <span>{item.name}</span>
                </a>
              </li>
            ))}
          </ul>
          <p className={styles.copy}>Copyright © Lonely 2026</p>
        </footer>
      </main>

      <p className={styles.hint}>{ui.hint}</p>
      <Grain />
    </div>
  );
}

function applyInk(el: HTMLElement, ink: number) {
  if (ink <= 0.02) {
    el.style.color = DIM_COLOR;
    el.style.backgroundImage = '';
    el.style.backgroundClip = '';
    el.style.webkitBackgroundClip = '';
    return;
  }
  if (ink >= 0.98) {
    el.style.color = LIT_COLOR;
    el.style.backgroundImage = '';
    el.style.backgroundClip = '';
    el.style.webkitBackgroundClip = '';
    return;
  }

  const pct = Math.round(ink * 1000) / 10;
  const edge = 7;
  const start = Math.max(0, pct - edge);
  const end = Math.min(100, pct + edge);
  el.style.color = 'transparent';
  el.style.backgroundImage = `linear-gradient(90deg, ${LIT_COLOR} ${start}%, ${DIM_COLOR} ${end}%)`;
  el.style.backgroundClip = 'text';
  el.style.webkitBackgroundClip = 'text';
}

function Grain() {
  return (
    <svg className={styles.grain} aria-hidden="true">
      <filter id="ink-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch" />
      </filter>
      <rect width="100%" height="100%" filter="url(#ink-grain)" />
    </svg>
  );
}
