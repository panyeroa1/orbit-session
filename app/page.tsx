'use client';

import Image from 'next/image';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { encodePassphrase, generateRoomId, randomString } from '@/lib/client-utils';
import styles from '../styles/Home.module.css';

export default function Page() {
  const router = useRouter();
  const [e2ee, setE2ee] = useState(false);
  const [sharedPassphrase, setSharedPassphrase] = useState(randomString(64));

  const joinRoom = () => {
    const roomId = generateRoomId();
    const href = e2ee ? `/rooms/${roomId}#${encodePassphrase(sharedPassphrase)}` : `/rooms/${roomId}`;
    router.push(href);
  };

  return (
    <main className={styles.main}>
      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <span className={styles.badge}>AI-Powered Education</span>
          <h1>
            Video conferencing<br />
            <span className={styles.accent}>reimagined</span>
          </h1>
          <p>
            Real-time translation, live transcription, and AI voice synthesis. 
            Built for modern classrooms.
          </p>
          <div className={styles.actions}>
            <button className={styles.primaryBtn} onClick={joinRoom}>
              Start Meeting
            </button>
            <button className={styles.secondaryBtn} onClick={() => window.location.assign('/integrations')}>
              Explore Features
            </button>
          </div>
          <div className={styles.encryption}>
            <label>
              <input
                type="checkbox"
                checked={e2ee}
                onChange={(ev) => setE2ee(ev.target.checked)}
              />
              <span>End-to-end encryption</span>
            </label>
            {e2ee && (
              <input
                className={styles.passphrase}
                type="password"
                value={sharedPassphrase}
                onChange={(ev) => setSharedPassphrase(ev.target.value)}
                placeholder="Passphrase..."
              />
            )}
          </div>
        </div>
        <div className={styles.heroImage}>
          <Image
            src="/images/hero-image.png"
            alt="Success Class Interface"
            width={600}
            height={400}
            priority
            className={styles.heroImg}
          />
        </div>
      </section>

      {/* Features Grid */}
      <section className={styles.features}>
        {[
          { icon: '🎯', title: 'Live Transcription', desc: 'Real-time captions powered by Deepgram & Web Speech.' },
          { icon: '🌐', title: 'AI Translation', desc: 'Instant translation via Google, Gemini, or Ollama.' },
          { icon: '🔊', title: 'Voice Synthesis', desc: 'Natural TTS with Cartesia Sonic-3 and Gemini Live.' },
          { icon: '🔒', title: 'Enterprise Security', desc: 'E2E encryption with granular access controls.' },
        ].map((f) => (
          <article key={f.title} className={styles.featureCard}>
            <span className={styles.featureIcon}>{f.icon}</span>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </article>
        ))}
      </section>

      {/* CTA Banner */}
      <section className={styles.cta}>
        <h2>Ready to transform your classroom?</h2>
        <p>Join thousands of educators using Success Class for seamless multilingual learning.</p>
        <button className={styles.primaryBtn} onClick={joinRoom}>
          Get Started Free
        </button>
      </section>
    </main>
  );
}
