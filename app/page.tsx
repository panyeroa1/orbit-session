'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import React, { Suspense, useState } from 'react';
import { encodePassphrase, generateRoomId, randomString } from '@/lib/client-utils';
import styles from '../styles/Home.module.css';

function Tabs(props: React.PropsWithChildren<{}>) {
  const searchParams = useSearchParams();
  const tabIndex = searchParams?.get('tab') === 'custom' ? 1 : 0;

  const router = useRouter();
  function onTabSelected(index: number) {
    const tab = index === 1 ? 'custom' : 'demo';
    router.push(`/?tab=${tab}`);
  }

  const labels = ['Start Meeting', 'Connect Server'];

  return (
    <div className={styles.tabContainer}>
      <div className={styles.tabSelect}>
        {labels.map((label, index) => (
          <button
            key={label}
            className={`${styles.tabButton} ${tabIndex === index ? styles.tabButtonActive : ''}`}
            onClick={() => onTabSelected(index)}
            role="tab"
            aria-selected={tabIndex === index}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {/* @ts-ignore */}
        {props.children[tabIndex]}
      </div>
    </div>
  );
}

function DemoMeetingTab(props: { label: string }) {
  const router = useRouter();
  const [e2ee, setE2ee] = useState(false);
  const [sharedPassphrase, setSharedPassphrase] = useState(randomString(64));
  
  const startMeeting = () => {
    if (e2ee) {
      router.push(`/rooms/${generateRoomId()}#${encodePassphrase(sharedPassphrase)}`);
    } else {
      router.push(`/rooms/${generateRoomId()}`);
    }
  };

  return (
    <div className={styles.tabContent}>
      <p className={styles.description}>
        Launch a secure, HD meeting room instantly. No downloads required.
      </p>
      <button className={styles.startButton} onClick={startMeeting}>
        Start Premium Meeting
      </button>
      
      <div className={styles.optionsSection}>
        <div className={styles.optionRow}>
          <span className={styles.optionLabel}>
            <svg className={styles.optionIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            End-to-end encryption
          </span>
          <label className={`${styles.toggle} ${e2ee ? styles.toggleActive : ''}`}>
            <input
              className={styles.toggleInput}
              type="checkbox"
              checked={e2ee}
              onChange={(ev) => setE2ee(ev.target.checked)}
              aria-label="Enable end-to-end encryption"
              title="Enable end-to-end encryption"
            />
          </label>
        </div>
        
        {e2ee && (
          <div className={styles.passphraseRow}>
            <span className={styles.passphraseLabel}>Encryption passphrase</span>
            <input
              className={styles.passphraseInput}
              type="password"
              value={sharedPassphrase}
              onChange={(ev) => setSharedPassphrase(ev.target.value)}
              placeholder="Enter secure passphrase..."
            />
          </div>
        )}
      </div>
    </div>
  );
}

function CustomConnectionTab(props: { label: string }) {
  const router = useRouter();
  const [e2ee, setE2ee] = useState(false);
  const [sharedPassphrase, setSharedPassphrase] = useState(randomString(64));

  const onSubmit: React.FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    const formData = new FormData(event.target as HTMLFormElement);
    const serverUrl = formData.get('serverUrl');
    const token = formData.get('token');
    if (e2ee) {
      router.push(
        `/custom/?orbitUrl=${serverUrl}&token=${token}#${encodePassphrase(sharedPassphrase)}`,
      );
    } else {
      router.push(`/custom/?orbitUrl=${serverUrl}&token=${token}`);
    }
  };

  return (
    <form className={styles.tabContent} onSubmit={onSubmit}>
      <p className={styles.customDescription}>
        Connect to your own Orbit Cloud or self-hosted server.
      </p>
      <input
        className={styles.input}
        id="serverUrl"
        name="serverUrl"
        type="url"
        placeholder="Orbit Server URL (wss://your-server.orbit.cloud)"
        required
      />
      <textarea
        className={styles.textarea}
        id="token"
        name="token"
        placeholder="Paste your access token here..."
        required
        rows={4}
      />
      
      <div className={styles.optionsSection}>
        <div className={styles.optionRow}>
          <span className={styles.optionLabel}>
            <svg className={styles.optionIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            End-to-end encryption
          </span>
          <label className={`${styles.toggle} ${e2ee ? styles.toggleActive : ''}`}>
            <input
              className={styles.toggleInput}
              type="checkbox"
              checked={e2ee}
              onChange={(ev) => setE2ee(ev.target.checked)}
              aria-label="Enable end-to-end encryption"
              title="Enable end-to-end encryption"
            />
          </label>
        </div>
        
        {e2ee && (
          <div className={styles.passphraseRow}>
            <span className={styles.passphraseLabel}>Encryption passphrase</span>
            <input
              className={styles.passphraseInput}
              type="password"
              value={sharedPassphrase}
              onChange={(ev) => setSharedPassphrase(ev.target.value)}
              placeholder="Enter secure passphrase..."
            />
          </div>
        )}
      </div>

      <hr className={styles.separator} />
      <button className={styles.submitButton} type="submit">
        Connect to Server
      </button>
    </form>
  );
}

export default function Page() {
  return (
    <>
      <main className={styles.main} data-lk-theme="default">
        {/* Hero Section */}
        <div className={styles.hero}>
          <div className={styles.badge}>
            <span className={styles.badgeDot} />
            Enterprise-Grade Video
          </div>
          
          <Image
            className={styles.logo}
            src="/images/success-class-logo.svg"
            alt="Eburon Meet"
            width={320}
            height={40}
            priority
          />
          
          <h1 className={styles.headline}>
            The Future of
            <br />
            <span className={styles.headlineAccent}>Premium Meetings</span>
          </h1>
          
          <p className={styles.subheadline}>
            Crystal-clear video, AI-powered transcription, and enterprise security.
            100x better than the rest.
          </p>
        </div>

        {/* Meeting Card */}
        <div className={styles.card}>
          <Suspense fallback="Loading...">
            <Tabs>
              <DemoMeetingTab label="Demo" />
              <CustomConnectionTab label="Custom" />
            </Tabs>
          </Suspense>
        </div>

        {/* Features */}
        <div className={styles.features}>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>✓</span>
            4K Video
          </div>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>✓</span>
            AI Transcription
          </div>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>✓</span>
            E2E Encryption
          </div>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>✓</span>
            No Downloads
          </div>
        </div>
      </main>

      <footer className={styles.footer}>
        Crafted by{' '}
        <a href="https://eburon.ai" rel="noopener">
          Eburon
        </a>
        {' '}— Premium video infrastructure for the future.
      </footer>
    </>
  );
}
