'use client';

import React from 'react';
import styles from '@/styles/SuccessClass.module.css';

interface TranslatorPluginFrameProps {
  isOpen: boolean;
}

export function TranslatorPluginFrame({ isOpen }: TranslatorPluginFrameProps) {
  return (
    <div
      className={`${styles.translatorOverlay} ${isOpen ? styles.translatorOverlayVisible : ''}`}
      aria-hidden={!isOpen}
    >
      <iframe
        className={styles.translatorFrame}
        src="/translator-plugin"
        title="Translator"
        loading="eager"
        allow="microphone; autoplay"
      />
    </div>
  );
}
