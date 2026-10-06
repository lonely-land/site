'use client';

import { useRef, type TransitionEvent } from 'react';
import styles from './Footer.module.css';
import settings from '@/settings.json';
import ContactIcon from './ContactIcon';

type LinkItem = {
  icon: string;
  name: string;
  url: string;
};

/** 填白层的三个阶段：in = 扫入中/已填满，out = 继续往右扫出中，idle = 停在字左侧待命（全镂空） */
type WipePhase = 'idle' | 'in' | 'out';

/**
 * Footer - 1:1 还原 .figma/1_34
 * 联系方式从 settings.json 动态渲染，hover 时下划线从左到右动画
 * Lonely 镂空大字的 hover 填白（白边从左往右扫过整块字）见 Footer.module.css 的 .lonelyFill
 */
export default function Footer() {
  const links = settings.links as LinkItem[];
  const fillRef = useRef<HTMLSpanElement>(null);

  const setPhase = (phase: WipePhase) => {
    const el = fillRef.current;
    if (el && el.dataset.phase !== phase) el.dataset.phase = phase;
  };

  // 扫出结束 = 白色已经完全在字的右侧之外，这时瞬移回左侧待命（两端都全镂空，跳变看不见）
  const handleWipeEnd = (event: TransitionEvent<HTMLSpanElement>) => {
    if (!event.propertyName.includes('mask-position')) return;
    if (fillRef.current?.dataset.phase === 'out') setPhase('idle');
  };

  return (
    <div
      className={styles.footer}
      onMouseEnter={() => setPhase('in')}
      onMouseLeave={() => setPhase('out')}
    >
      <p className={`sectionTitle ${styles.contact}`}>Contact</p>
      <div className={styles.autoWrapper}>
        <div className={styles.frame1}>
          {links.map((item, index) => (
            <a
              key={index}
              href={item.url}
              target={item.url.startsWith('mailto:') ? undefined : '_blank'}
              rel={item.url.startsWith('mailto:') ? undefined : 'noopener noreferrer'}
              className={styles.frame2}
            >
              <ContactIcon name={item.icon} className={styles.contactIcon} />
              <span className={styles.contactText}>{item.name}</span>
            </a>
          ))}
        </div>
        <p className={styles.lonely}>
          Lonely
          {/* hover 填白层：与镂空字逐字重叠，靠移动的白色窗口从左往右扫入 / 继续往右扫出 */}
          <span
            ref={fillRef}
            className={styles.lonelyFill}
            aria-hidden="true"
            onTransitionEnd={handleWipeEnd}
          >
            Lonely
          </span>
        </p>
      </div>
    </div>
  );
}
