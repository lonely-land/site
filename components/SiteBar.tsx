'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './SiteBar.module.css';

const LINKS = [
  { href: '/music', label: 'Music' },
  { href: '/anime', label: 'Anime' },
  { href: '/games', label: 'Games' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/friends', label: 'Friends' },
];

export default function SiteBar() {
  const path = usePathname() || '/';

  return (
    <header className={styles.bar}>
      <Link href="/" className={styles.mark} aria-current={path === '/' ? 'page' : undefined}>
        Lonely
      </Link>
      <nav className={styles.nav} aria-label="站点">
        {LINKS.map((item) => {
          const active = path === item.href || path.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={active ? styles.active : undefined}
              aria-current={active ? 'page' : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
