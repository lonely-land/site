'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import styles from './Landing.module.css';
import settings from '@/settings.json';

const TITLE_WORDS = ['Hello,', "I'm", 'Lonely.'];
const SUBTITLE_WORDS = ['Take', 'picture,', 'write', 'code', 'and', 'design', 'product.'];

// 背景图托管在 R2，地址放 settings.json；
// 若配置缺失则回退到仓库内路径（本地开发时可能还在）
const BACKGROUND_IMAGE =
  (settings as { landing?: { background?: string } }).landing?.background || '/images/landing-bg.png';

/**
 * Landing Page - 1:1 还原 .figma/1_2
 * 1. 初始背景为黑色
 * 2. Title 和 Subtitle 逐词动画（模糊→清晰 + 下→上）
 * 3. 动画完成且背景图加载完成后，黑色遮罩淡出，渐变到背景图
 */
export default function Landing() {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLParagraphElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [animDone, setAnimDone] = useState(false);

  // 预加载背景图片 + 超时兜底（防止图片加载失败导致永久黑屏/锁死）
  useEffect(() => {
    const img = new Image();
    img.onload = () => setImageLoaded(true);
    img.src = BACKGROUND_IMAGE;

    // 3.5 秒超时：无论图片是否加载完成、动画是否播完，强制就绪
    // 避免用户被永久锁在黑屏 Landing 上
    const timeout = setTimeout(() => {
      setImageLoaded(true);
      setAnimDone(true);
    }, 3500);

    return () => { img.onload = null; clearTimeout(timeout); };
  }, []);

  // 词汇动画
  useEffect(() => {
    if (!titleRef.current || !subtitleRef.current) return;

    const titleWords = titleRef.current.querySelectorAll(`.${styles.word}`);
    const subtitleWords = subtitleRef.current.querySelectorAll(`.${styles.word}`);
    if (!titleWords.length || !subtitleWords.length) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ delay: 0.3 });

      // Title: 逐词从模糊到清晰 + 从下往上滑
      tl.fromTo(
        titleWords,
        { opacity: 0, filter: 'blur(20px)', y: 60 },
        {
          opacity: 1, filter: 'blur(0px)', y: 0, duration: 1.2, stagger: 0.2, ease: 'power3.out',
          onComplete: () => {
            // 动画完成后移除 will-change，释放 GPU 层
            titleWords.forEach((w: Element) => (w as HTMLElement).style.willChange = 'auto');
          },
        }
      );

      // Subtitle: 标题动画后开始，参数稍小以适配较小字号
      tl.fromTo(
        subtitleWords,
        { opacity: 0, filter: 'blur(15px)', y: 40 },
        {
          opacity: 1, filter: 'blur(0px)', y: 0, duration: 0.8, stagger: 0.08, ease: 'power3.out',
          onComplete: () => {
            subtitleWords.forEach((w: Element) => (w as HTMLElement).style.willChange = 'auto');
          },
        },
        '-=0.5'
      );

      // 动画完成回调
      tl.call(() => setAnimDone(true));
    }, containerRef);

    return () => ctx.revert();
  }, []);

  // 当动画完成且图片加载完成时，淡出黑色遮罩
  useEffect(() => {
    if (!imageLoaded || !animDone || !overlayRef.current) return;

    gsap.to(overlayRef.current, {
      opacity: 0,
      duration: 1.5,
      ease: 'power2.inOut',
      delay: 0.2,
      onStart: () => {
        // 通知拨码轮：Landing 已就绪，可以允许滚动了
        // 防止用户在黑屏期间滚动导致黑屏切换
        window.dispatchEvent(new CustomEvent('landing-ready'));
      },
    });
  }, [imageLoaded, animDone]);

  return (
    <div
      className={styles.landingPage}
      ref={containerRef}
      style={{ '--landing-bg': `url("${BACKGROUND_IMAGE}")` } as React.CSSProperties}
    >
      <div className={styles.bgOverlay} ref={overlayRef} />
      <p className={styles.title} ref={titleRef}>
        {TITLE_WORDS.map((word, i) => (
          <span key={i}>
            {i > 0 && ' '}
            <span className={styles.word}>{word}</span>
          </span>
        ))}
      </p>
      <p className={styles.title2} ref={subtitleRef}>
        {SUBTITLE_WORDS.map((word, i) => (
          <span key={i}>
            {i > 0 && ' '}
            <span className={styles.word}>{word}</span>
          </span>
        ))}
      </p>
      <p className={styles.copyrightLonely2026}>Copyright © Lonely 2026</p>
    </div>
  );
}
