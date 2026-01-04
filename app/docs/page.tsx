import Link from 'next/link';
import styles from '@/styles/DeveloperDocs.module.css';

export const metadata = {
  title: 'Developer API Documentation | Eburon',
  description: 'Developer API reference for Eburon rooms, recordings, and integrations.',
};

export default function DeveloperDocsPage() {
  return (
    <main className={styles.page}>
      <div className={styles.glow} />
      <header className={styles.hero}>
        <div className={styles.heroTop}>
          <span className={styles.badge}>Developer API</span>
          <Link className={styles.backLink} href="/">
            Back to lobby
          </Link>
        </div>
        <h1>Eburon Developer Documentation</h1>
        <p>
          Endpoints, auth, and integration patterns for building on top of Eburon.
          Use these APIs to create rooms, manage participants, and automate
          workflows with your own services.
        </p>
        <div className={styles.heroActions}>
          <a className={styles.primaryButton} href="#quickstart">
            Quickstart
          </a>
          <a className={styles.secondaryButton} href="#endpoints">
            API reference
          </a>
        </div>
      </header>

      <section className={styles.section} id="overview">
        <div className={styles.sectionHeader}>
          <h2>Overview</h2>
          <p>
            Eburon runs on Orbit Conference. The server-side APIs are exposed as Next.js
            routes under <code>/api</code> and require the server environment keys to
            access your Orbit Cloud securely.
          </p>
        </div>
        <div className={styles.cardGrid}>
          <article className={styles.card}>
            <h3>Authentication</h3>
            <p>
              Server routes sign requests with <code>LIVEKIT_API_KEY</code> and
              <code>LIVEKIT_API_SECRET</code>. Keep these on the server only.
            </p>
          </article>
          <article className={styles.card}>
            <h3>Base URL</h3>
            <p>
              All endpoints are same-origin. Example:
              <code className={styles.inlineCode}>https://your-domain.com/api</code>
            </p>
          </article>
          <article className={styles.card}>
            <h3>Realtime events</h3>
            <p>
              Room events, track state, and participant changes stream through Orbit.
              Client UI reads state from the Orbit SDK.
            </p>
          </article>
        </div>
      </section>

      <section className={styles.section} id="quickstart">
        <div className={styles.sectionHeader}>
          <h2>Quickstart</h2>
          <p>Generate connection details, then join a room from the client.</p>
        </div>
        <div className={styles.codeBlock}>
          <pre>
            <code>
{`POST /api/connection-details
{
  "roomName": "class-9a3c",
  "participantName": "Instructor"
}`}
            </code>
          </pre>
        </div>
        <div className={styles.codeBlock}>
          <pre>
            <code>
{`curl -X POST https://your-domain.com/api/connection-details \\
  -H "Content-Type: application/json" \\
  -d '{"roomName":"class-9a3c","participantName":"Instructor"}'`}
            </code>
          </pre>
        </div>
      </section>

      <section className={styles.section} id="endpoints">
        <div className={styles.sectionHeader}>
          <h2>API Endpoints</h2>
          <p>Server-side routes for live operations.</p>
        </div>
        <div className={styles.endpointGrid}>
          <article className={styles.endpointCard}>
            <div className={styles.endpointHeader}>
              <span className={styles.method}>POST</span>
              <span className={styles.path}>/api/connection-details</span>
            </div>
            <p>Create an Orbit token and return room connection details.</p>
          </article>
          <article className={styles.endpointCard}>
            <div className={styles.endpointHeader}>
              <span className={styles.method}>POST</span>
              <span className={styles.path}>/api/room/mute</span>
            </div>
            <p>Mute or unmute a participant audio/video track.</p>
          </article>
          <article className={styles.endpointCard}>
            <div className={styles.endpointHeader}>
              <span className={styles.method}>POST</span>
              <span className={styles.path}>/api/room/mute-all</span>
            </div>
            <p>Mute all participants in a room (except host).</p>
          </article>
          <article className={styles.endpointCard}>
            <div className={styles.endpointHeader}>
              <span className={styles.method}>POST</span>
              <span className={styles.path}>/api/room/remove</span>
            </div>
            <p>Remove a participant from the room.</p>
          </article>
          <article className={styles.endpointCard}>
            <div className={styles.endpointHeader}>
              <span className={styles.method}>POST</span>
              <span className={styles.path}>/api/transcription</span>
            </div>
            <p>Send audio chunks for live captions (Deepgram).</p>
          </article>
          <article className={styles.endpointCard}>
            <div className={styles.endpointHeader}>
              <span className={styles.method}>POST</span>
              <span className={styles.path}>/api/agent</span>
            </div>
            <p>AI assistant powered by Ollama Cloud.</p>
          </article>
          <article className={styles.endpointCard}>
            <div className={styles.endpointHeader}>
              <span className={styles.methodGet}>GET</span>
              <span className={styles.path}>/api/transcription/stream</span>
            </div>
            <p>SSE stream for real-time transcription. Requires <code>meetingId</code> query param.</p>
          </article>
          <article className={styles.endpointCard}>
            <div className={styles.endpointHeader}>
              <span className={styles.method}>POST</span>
              <span className={styles.path}>/api/transcription/stream</span>
            </div>
            <p>Publish transcript segments to all stream listeners.</p>
          </article>
          <article className={styles.endpointCard}>
            <div className={styles.endpointHeader}>
              <span className={styles.method}>POST</span>
              <span className={styles.path}>/api/transcription/save</span>
            </div>
            <p>Save transcript segments to Supabase database.</p>
          </article>
        </div>
      </section>

      <section className={styles.section} id="environment">
        <div className={styles.sectionHeader}>
          <h2>Environment variables</h2>
          <p>Configure these on the server (Vercel or local .env).</p>
        </div>
        <div className={styles.codeBlock}>
          <pre>
            <code>
{`LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
LIVEKIT_URL=wss://your-project.orbit.cloud

OLLAMA_API_KEY=...
OLLAMA_BASE_URL=https://ollama.com
OLLAMA_MODEL=gpt-oss:120b

DEEPGRAM_API_KEY=...`}
            </code>
          </pre>
        </div>
      </section>

      <section className={styles.section} id="captions">
        <div className={styles.sectionHeader}>
          <h2>Captions pipeline</h2>
          <p>
            Captions are generated by sending short audio chunks from the browser to
            <code>/api/transcription</code>. The UI renders a single horizontal subtitle
            bar across the main video grid.
          </p>
        </div>
        <div className={styles.callout}>
          <h3>Tip</h3>
          <p>
            If you replace Deepgram with another provider, keep the response format
            compatible: <code>{'{ "transcript": "..." }'}</code>.
          </p>
        </div>
      </section>

      <section className={styles.section} id="errors">
        <div className={styles.sectionHeader}>
          <h2>Error handling</h2>
          <p>Standard HTTP status codes are returned with a short text body.</p>
        </div>
        <div className={styles.cardGrid}>
          <article className={styles.card}>
            <h3>400</h3>
            <p>Missing or invalid request payload.</p>
          </article>
          <article className={styles.card}>
            <h3>401/403</h3>
            <p>Missing or invalid credentials.</p>
          </article>
          <article className={styles.card}>
            <h3>500</h3>
            <p>Unexpected server error. Check logs for details.</p>
          </article>
        </div>
      </section>

      <section className={styles.section} id="transcription-stream">
        <div className={styles.sectionHeader}>
          <h2>Real-time Transcription Stream</h2>
          <p>
            Connect to live transcription using Server-Sent Events (SSE). Perfect for
            building custom caption UIs or integrating with external services.
          </p>
        </div>
        <div className={styles.callout}>
          <h3>Message Format</h3>
          <p>Each SSE message contains a JSON payload:</p>
        </div>
        <div className={styles.codeBlock}>
          <pre>
            <code>
{`{
  "type": "transcript",
  "meetingId": "room-abc-123",
  "speakerId": "participant-xyz",
  "speakerName": "John Doe",
  "text": "Hello everyone!",
  "timestamp": 1704355200000,
  "isFinal": true,
  "language": "en"
}`}
            </code>
          </pre>
        </div>
        <div className={styles.callout}>
          <h3>JavaScript Client Example</h3>
          <p>Subscribe to real-time transcripts:</p>
        </div>
        <div className={styles.codeBlock}>
          <pre>
            <code>
{`const meetingId = 'your-meeting-id';
const eventSource = new EventSource(
  \`/api/transcription/stream?meetingId=\${meetingId}\`
);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(\`[\${data.speakerName}]: \${data.text}\`);
};

eventSource.onerror = () => {
  console.error('Connection lost, reconnecting...');
};`}
            </code>
          </pre>
        </div>
        <div className={styles.callout}>
          <h3>Publishing Transcripts</h3>
          <p>Send transcript segments to all listeners:</p>
        </div>
        <div className={styles.codeBlock}>
          <pre>
            <code>
{`fetch('/api/transcription/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    meetingId: 'room-abc-123',
    speakerId: 'local-participant',
    speakerName: 'Jane Doe',
    text: 'This is a transcription segment.',
    isFinal: true,
    language: 'en'
  })
});`}
            </code>
          </pre>
        </div>
      </section>

      <footer className={styles.footer}>
        <span>Eburon Developer API</span>
        <a href="https://eburon.ai" target="_blank" rel="noopener noreferrer">
          Powered by Orbit Conference
        </a>
      </footer>
    </main>
  );
}
