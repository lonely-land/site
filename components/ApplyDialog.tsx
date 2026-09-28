'use client';

import { useEffect } from 'react';
import { Mail, X } from 'lucide-react';
import BrandIcon from './BrandIcon';
import styles from './ApplyDialog.module.css';

const REPO_URL = 'https://github.com/v0id-ink/site';
const ISSUE_URL = `${REPO_URL}/issues/new?labels=friend-submission&template=friend-submission.yml`;
const MAIL_ADDRESS = 'hi-friends@v0id.ink';

type ApplyDialogProps = {
  open: boolean;
  onClose: () => void;
};

export default function ApplyDialog({ open, onClose }: ApplyDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={styles.overlay}
      data-slot-lightbox
      onClick={onClose}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="apply-dialog-title"
    >
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <div className={styles.headText}>
            <h2 id="apply-dialog-title" className={styles.title}>
              Welcome, Friends.
            </h2>
            <p className={`caption ${styles.subtitle}`}>
              Choose your submission method.
            </p>
          </div>

          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close"
          >
            <X size={20} strokeWidth={1.75} aria-hidden focusable="false" />
          </button>
        </div>

        <div className={styles.buttons}>
          <a
            href={ISSUE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.btn}
          >
            <BrandIcon name="github" size={20} className={styles.btnIcon} />
            <span className={styles.btnMain}>Github</span>
            <span className={styles.btnHint}>(recommend)</span>
          </a>
          <a
            href={`mailto:${MAIL_ADDRESS}`}
            className={styles.btn}
          >
            <Mail
              size={20}
              strokeWidth={1.75}
              aria-hidden
              focusable="false"
              className={styles.btnIcon}
            />
            <span className={styles.btnMain}>Mail</span>
          </a>
        </div>
      </div>
    </div>
  );
}
