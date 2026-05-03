import { isWeakSessionTopic } from '@/stores/chatStore';

type SessionLike = {
  key?: string;
  topic?: string;
  lastMessage?: string | { content?: string };
  label?: string;
};

function normalizeText(value?: string): string {
  return String(value ?? '').trim();
}

export function getSessionDisplayLabel(
  session: SessionLike | undefined,
  options?: { mainSessionLabel?: string; genericSessionLabel?: string },
): string {
  const key = normalizeText(session?.key);
  const mainSessionLabel = options?.mainSessionLabel ?? 'Main Session';
  const genericSessionLabel = options?.genericSessionLabel ?? 'Session';

  if (!key) return genericSessionLabel;
  if (key === 'agent:main:main') return mainSessionLabel;

  const topic = normalizeText(session?.topic);
  if (topic && !isWeakSessionTopic(topic)) return topic;

  const rawLastMessage = session?.lastMessage;
  const lastMessage = normalizeText(
    typeof rawLastMessage === 'string' ? rawLastMessage : rawLastMessage?.content,
  );
  if (lastMessage && !isWeakSessionTopic(lastMessage)) return lastMessage.slice(0, 32);

  const label = normalizeText(session?.label);
  const isGenerated = label === key || /^desktop-\d+$/i.test(label);
  if (label && !isGenerated) return label;

  const lastKeyPart = key.split(':').pop() || key;
  if (/^desktop-\d+$/i.test(lastKeyPart)) return genericSessionLabel;
  return lastKeyPart;
}
