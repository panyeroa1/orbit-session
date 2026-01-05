'use client';

import React from 'react';
import styles from '../styles/Eburon.module.css';

type AgentMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const INITIAL_MESSAGE: AgentMessage = {
  role: 'assistant',
  content: 'Ask me anything about Eburon, features, or how the app works.',
};

export function AgentPanel() {
  const [messages, setMessages] = React.useState<AgentMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const messagesRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const sendMessage = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) {
      return;
    }

    const nextMessages: AgentMessage[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(nextMessages);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Agent request failed');
      }

      const data = await response.json();
      const reply = typeof data?.reply === 'string' ? data.reply : '';

      if (!reply) {
        throw new Error('Empty agent response');
      }

      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Agent request failed';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.sidebarPanel}>
      <div className={styles.sidebarHeader}>
        <h3>Agent</h3>
      </div>
      <div className={styles.agentBody}>
        <div className={styles.agentMessages} ref={messagesRef}>
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`${styles.agentMessage} ${
                message.role === 'user'
                  ? styles.agentMessageUser
                  : styles.agentMessageAssistant
              }`}
            >
              <span className={styles.agentRole}>
                {message.role === 'user' ? 'You' : 'Agent'}
              </span>
              <p className={styles.agentText}>{message.content}</p>
            </div>
          ))}
          {isLoading && (
            <div className={`${styles.agentMessage} ${styles.agentMessageAssistant}`}>
              <span className={styles.agentRole}>Agent</span>
              <p className={styles.agentText}>Thinking...</p>
            </div>
          )}
        </div>
        {error && <div className={styles.agentError}>{error}</div>}
        <form className={styles.agentForm} onSubmit={sendMessage}>
          <textarea
            className={styles.agentInput}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask about features, flows, or setup..."
            rows={2}
            aria-label="Ask the agent"
          />
          <button
            className={styles.agentSendButton}
            type="submit"
            disabled={isLoading || input.trim().length === 0}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
