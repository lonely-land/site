'use client';

import { useRef, useState, useEffect, useLayoutEffect, ReactNode, Children } from 'react';
import gsap from 'gsap';
import { DURATION } from '@/lib/motion';
import { createWheelGesture, wheelDeltaPx, WHEEL_GESTURE } from '@/lib/wheel-gesture.mjs';
import styles from './SlotWheelTransition.module.css';

interface SlotWheelTransitionProps {
  children: ReactNode;
}

/**
 * 拨码轮切换（Slot Wheel Transition）
 *
 * - 蓄力段（0.1s）：当前 Block 微动，给一点机械阻力感
 * - 释放段（0.4s）：当前 Block 加速翻出，目标 Block 从下方快速滚入
 *   入口用 power3.out（起步快），避免中间出现黑屏空档
 * - 过冲回弹（0.18s）：目标 Block 轻微过冲后回弹，模拟拨码轮惯性
 *
 * 触发：wheel / touch / keyboard，scroll-snap 锁定每个 Block
 *
 * wheel 的归属见 lib/wheel-gesture：一段手势（含触控板惯性尾巴）最多推进
 * 一格，避免"用力猛一点就跳过一整屏"。
 *
 * 动效说明：这里的 0.08 / 0.1 / 0.18s 是刻意为之的"机械感"编排
 * （蓄力→释放→过冲回弹），不走通用 token；与 token 等值的 0.4s 用 DURATION.base。
 */
export default function SlotWheelTransition({ children }: SlotWheelTransitionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sectionsRef = useRef<(HTMLDivElement | null)[]>([]);
  const currentIndex = useRef(0);
  const isAnimating = useRef(false);
  const touchStartY = useRef(0);
  const touchStartX = useRef(0);
  const touchStartTime = useRef(0);
  const touchLockRef = useRef(0);
  /** 动画期间攒下的鼠标格（+1/-1），动画结束接着走 */
  const pendingStepRef = useRef(0);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  // Landing 未就绪时锁定滚动，防止黑屏切换
  const landingReadyRef = useRef(false);

  const [activeIndex, setActiveIndex] = useState(0);

  const blocks = Children.toArray(children);
  const totalBlocks = blocks.length;

  // ---- 核心切换函数 ----
  const goToSection = (targetIndex: number) => {
    if (isAnimating.current) return;
    if (targetIndex < 0 || targetIndex >= totalBlocks) return;
    if (targetIndex === currentIndex.current) return;

    // 灯箱打开时禁止切换
    if (document.querySelector('[data-slot-lightbox]')) return;

    isAnimating.current = true;

    const direction = targetIndex > currentIndex.current ? 1 : -1;
    const currentSection = sectionsRef.current[currentIndex.current];
    const targetSection = sectionsRef.current[targetIndex];

    if (!currentSection || !targetSection) {
      isAnimating.current = false;
      return;
    }

    if (timelineRef.current) {
      timelineRef.current.kill();
    }

    const tl = gsap.timeline({
      onComplete: () => {
        currentIndex.current = targetIndex;
        setActiveIndex(targetIndex);
        // 短暂冷却，防止触摸/键盘连触发
        setTimeout(() => {
          isAnimating.current = false;
          // 动画期间攒下的格：一次只兑现一格（连点三下 = 连着翻三屏，
          // 而不是一次跳过中间那屏）
          const queued = pendingStepRef.current;
          if (queued !== 0 && !document.querySelector('[data-slot-lightbox]')) {
            pendingStepRef.current = queued > 0 ? queued - 1 : queued + 1;
            goToSectionRef.current(currentIndex.current + (queued > 0 ? 1 : -1));
          }
        }, 100);
      },
    });
    timelineRef.current = tl;

    if (direction === 1) {
      // 向下切换：当前 Block 向上翻出，目标 Block 从下方滚入
      // 蓄力段（0.1s）：当前 Block 微动，给一点机械阻力感
      tl.to(currentSection, {
        yPercent: -1,
        duration: 0.1,
        ease: 'sine.in',
      });
      // 释放段（0.4s）：当前 Block 加速翻出
      tl.to(currentSection, {
        yPercent: -100,
        duration: DURATION.base,
        ease: 'power2.in',
      });
      // 目标 Block 从下方快速滚入（power3.out 起步快，不会出现空档黑屏）
      // y:0 确保不残留像素位移，只用 yPercent 做百分比动画
      tl.fromTo(
        targetSection,
        { y: 0, yPercent: 100 },
        {
          y: 0,
          yPercent: 0,
          duration: DURATION.base,
          ease: 'power3.out',
        },
        0.1,
      );
      // 过冲回弹（0.18s）：模拟拨码轮惯性
      tl.to(targetSection, {
        yPercent: -1.5,
        duration: 0.08,
        ease: 'power2.out',
      });
      tl.to(targetSection, {
        yPercent: 0,
        duration: 0.1,
        ease: 'power2.inOut',
      });
    } else {
      // 向上切换：当前 Block 向下翻出，目标 Block 从上方滚入
      tl.to(currentSection, {
        yPercent: 1,
        duration: 0.1,
        ease: 'sine.in',
      });
      tl.to(currentSection, {
        yPercent: 100,
        duration: DURATION.base,
        ease: 'power2.in',
      });
      tl.fromTo(
        targetSection,
        { y: 0, yPercent: -100 },
        {
          y: 0,
          yPercent: 0,
          duration: DURATION.base,
          ease: 'power3.out',
        },
        0.1,
      );
      tl.to(targetSection, {
        yPercent: 1.5,
        duration: 0.08,
        ease: 'power2.out',
      });
      tl.to(targetSection, {
        yPercent: 0,
        duration: 0.1,
        ease: 'power2.inOut',
      });
    }
  };

  // 用 ref 存储最新函数，事件监听器始终调用最新版本
  const goToSectionRef = useRef(goToSection);
  goToSectionRef.current = goToSection;

  // ---- 初始化位置 ----
  // 用 useLayoutEffect 在首次绘制前定位，配合 CSS visibility:hidden 防止闪烁
  // 必须显式设 y:0 清除像素位移，否则 GSAP 可能残留 y 像素值导致双重位移
  useLayoutEffect(() => {
    const sections = sectionsRef.current.filter(Boolean) as HTMLDivElement[];
    sections.forEach((section, index) => {
      gsap.set(section, {
        y: 0,
        yPercent: index === 0 ? 0 : 100,
        visibility: 'visible',
      });
    });
  }, []);

  // ---- 监听 Landing 就绪事件 ----
  // Landing 的黑色遮罩淡出时才允许滚动切换，防止黑屏
  useEffect(() => {
    const handleReady = () => {
      landingReadyRef.current = true;
    };
    window.addEventListener('landing-ready', handleReady);
    return () => window.removeEventListener('landing-ready', handleReady);
  }, []);

  // ---- Wheel 事件 ----
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 一段手势最多推进一格：惯性尾巴（同一段手势）只吸收、不再触发
    const gesture = createWheelGesture();

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      // 灯箱打开时不做任何处理
      if (document.querySelector('[data-slot-lightbox]')) return;

      // Landing 未就绪时禁止切换（防止黑屏）
      if (!landingReadyRef.current) return;

      // Gallery 自行处理横向滚动并 stopPropagation，
      // 到达此处的事件来自非 Gallery 区域或 Gallery 已到边缘 → 切换 section

      // 注意：动画中也要把事件喂进手势（beginEvent 负责续期"同一段手势"），
      // 否则惯性尾巴会被误判成"新手势"，动画一结束就又跳一格
      // —— 这正是"用力猛一点就划过头"的来源
      const { absorbing, notch } = gesture.beginEvent(e);
      if (absorbing) return;

      // 鼠标滚轮是离散输入：一格走一格，不累积、不等待（"PC 上敏感一点"）；
      // 触控板走原路：一段手势累积够 triggerPx 才走一格
      const step = notch ? gesture.takeNotchStep(wheelDeltaPx(e)) : gesture.takeStep(wheelDeltaPx(e));
      if (step === 0) return;
      if (isAnimating.current) {
        // 动画期间别把用户的意图丢掉：排队，一格一次动画（连点几下就连着走几屏）。
        // 一段连续流最多只会产生一格，所以排队不会把"用力一划"变成两屏。
        pendingStepRef.current = Math.max(-3, Math.min(3, pendingStepRef.current + step));
        return;
      }

      goToSectionRef.current(currentIndex.current + step);
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // ---- Touch 事件 ----
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartY.current = e.touches[0].clientY;
      touchStartX.current = e.touches[0].clientX;
      touchStartTime.current = Date.now();
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (document.querySelector('[data-slot-lightbox]')) return;
      if (!landingReadyRef.current) return;
      if (isAnimating.current) return;

      const currentY = e.touches[0].clientY;
      const currentX = e.touches[0].clientX;
      const deltaY = touchStartY.current - currentY;
      const deltaX = touchStartX.current - currentX;

      // 纵向滑动占主导时阻止默认行为，防止浏览器在 Gallery 横向滚动区域上
      // 触发 touchcancel（导致 touchend 永远不触发，无法切换 section）
      if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 10) {
        e.preventDefault();
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (document.querySelector('[data-slot-lightbox]')) return;
      if (isAnimating.current) return;
      // Landing 未就绪时禁止切换（防止黑屏）
      if (!landingReadyRef.current) return;

      const endY = e.changedTouches[0].clientY;
      const endX = e.changedTouches[0].clientX;
      const deltaY = touchStartY.current - endY;
      const deltaX = touchStartX.current - endX;
      const elapsed = Date.now() - touchStartTime.current;

      // 只处理纵向滑动（deltaY 须占主导且足够长）
      if (Math.abs(deltaY) < 50 || Math.abs(deltaY) < Math.abs(deltaX)) return;
      if (elapsed > 800) return;

      // 与滚轮同一套"顿"的手感：一次滑动一格，翻过之后要停一下再滑
      // （连续快滑常是两个 touchend 紧挨着来，不加锁就会连跳两屏）
      if (Date.now() < touchLockRef.current) return;
      touchLockRef.current = Date.now() + WHEEL_GESTURE.touchLockMs;

      if (deltaY > 0) {
        goToSectionRef.current(currentIndex.current + 1);
      } else {
        goToSectionRef.current(currentIndex.current - 1);
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  // ---- 键盘事件 ----
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.querySelector('[data-slot-lightbox]')) return;
      if (isAnimating.current) return;
      // Landing 未就绪时禁止切换（防止黑屏）
      if (!landingReadyRef.current) return;

      switch (e.key) {
        case 'ArrowDown':
        case 'PageDown':
        case ' ':
          e.preventDefault();
          goToSectionRef.current(currentIndex.current + 1);
          break;
        case 'ArrowUp':
        case 'PageUp':
          e.preventDefault();
          goToSectionRef.current(currentIndex.current - 1);
          break;
        case 'Home':
          e.preventDefault();
          goToSectionRef.current(0);
          break;
        case 'End':
          e.preventDefault();
          goToSectionRef.current(totalBlocks - 1);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [totalBlocks]);

  // ---- 清理 ----
  useEffect(() => {
    return () => {
      if (timelineRef.current) {
        timelineRef.current.kill();
      }
    };
  }, []);

  // activeIndex 用于控制 skipWhenOffscreen：仅对距当前 section 超过 1 个
  // 位置的 section 跳过渲染，确保相邻 section（如 Gallery）的图片能预加载

  return (
    <div ref={containerRef} className={styles.container}>
      {blocks.map((block, index) => (
        <div
          key={index}
          ref={(el) => {
            sectionsRef.current[index] = el;
          }}
          className={`${styles.section} ${Math.abs(index - activeIndex) > 1 ? 'skipWhenOffscreen' : ''}`}
        >
          {block}
        </div>
      ))}
    </div>
  );
}
