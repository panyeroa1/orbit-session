'use client';

import React from 'react';
import TranslatorApp from '@/translator-pluginv1/App';
import styles from './TranslatorPlugin.module.css';

const TAILWIND_CONFIG_ID = 'translator-tailwind-config';
const TAILWIND_SCRIPT_ID = 'translator-tailwind-script';
const TAILWIND_STYLE_ID = 'translator-tailwind-style';

export default function TranslatorPluginPage() {
  const [isReady, setIsReady] = React.useState(false);

  React.useEffect(() => {
    const ensureConfig = () => {
      if (document.getElementById(TAILWIND_CONFIG_ID)) {
        return;
      }
      const configScript = document.createElement('script');
      configScript.id = TAILWIND_CONFIG_ID;
      configScript.text = 'tailwind.config = { corePlugins: { preflight: false } };';
      document.head.appendChild(configScript);
    };

    const ensureStyle = () => {
      if (document.getElementById(TAILWIND_STYLE_ID)) {
        return;
      }
      const style = document.createElement('style');
      style.id = TAILWIND_STYLE_ID;
      style.textContent = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
body {
  font-family: 'Inter', sans-serif;
  background-color: #1D0E32;
  color: #FDF0E0;
  margin: 0;
}
@keyframes live-pulse {
  0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
  70% { box-shadow: 0 0 0 12px rgba(239, 68, 68, 0); }
  100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
}
.animate-live-pulse {
  animation: live-pulse 2s infinite;
}
`;
      document.head.appendChild(style);
    };

    const handleLoad = () => {
      const script = document.getElementById(TAILWIND_SCRIPT_ID) as HTMLScriptElement | null;
      if (script) {
        script.dataset.loaded = 'true';
      }
      setIsReady(true);
    };

    ensureConfig();
    ensureStyle();

    const existingScript = document.getElementById(TAILWIND_SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      if (existingScript.dataset.loaded === 'true') {
        setIsReady(true);
      } else {
        existingScript.addEventListener('load', handleLoad);
      }
      return () => {
        existingScript.removeEventListener('load', handleLoad);
      };
    }

    const script = document.createElement('script');
    script.id = TAILWIND_SCRIPT_ID;
    script.src = 'https://cdn.tailwindcss.com';
    script.addEventListener('load', handleLoad);
    document.head.appendChild(script);

    return () => {
      script.removeEventListener('load', handleLoad);
    };
  }, []);

  if (!isReady) {
    return (
      <div className={styles.loadingContainer}>
        Loading translator...
      </div>
    );
  }

  return <TranslatorApp />;
}
