'use client';

import styles from './Footer.module.css';
import settings from '@/settings.json';
import ContactIcon from './ContactIcon';

type LinkItem = {
  icon: string;
  name: string;
  url: string;
};

/**
 * Footer - 1:1 还原 .figma/1_34
 * 联系方式从 settings.json 动态渲染，hover 时下划线从左到右动画
 */
export default function Footer() {
  const links = settings.links as LinkItem[];

  return (
    <div className={styles.footer}>
      <p className={styles.contact}>Contact</p>
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
        <p className={styles.lonely}>Lonely</p>
      </div>
    </div>
  );
}
