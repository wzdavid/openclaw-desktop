import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Paperclip, Camera, Mic, X, Loader2, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '@/stores/chatStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { gateway } from '@/services/gateway';
import { ScreenshotPicker } from './ScreenshotPicker';
import { VoiceRecorder } from './VoiceRecorder';
import { EmojiPicker } from './EmojiPicker';
import { getDirection } from '@/i18n';
import clsx from 'clsx';

function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// ═══════════════════════════════════════════════════════════
// Message Input — premium input with attachments
// ═══════════════════════════════════════════════════════════

interface PendingFile {
  name: string;
  base64: string;
  mimeType: string;
  isImage: boolean;
  size: number;
  preview?: string;
  path?: string;  // Windows path — non-image files send path instead of base64
}

export function MessageInput() {
  const { t } = useTranslation();
  const { language } = useSettingsStore();
  const dir = getDirection(language);
  const {
    isSending,
    setIsSending,
    connected,
    addMessage,
    setIsTyping,
    isTyping,
    activeSessionKey,
    drafts,
    setDraft,
    messages,
    historyLoader,
    isLoadingHistory,
  } = useChatStore();
  const [text, setText] = useState(() => drafts[activeSessionKey] || '');
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [screenshotOpen, setScreenshotOpen] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isComposingRef = useRef(false);
  const isHistoryWarmupGate = connected && messages.length === 0 && isLoadingHistory;

  // Sync draft when switching sessions
  useEffect(() => {
    setText(drafts[activeSessionKey] || '');
  }, [activeSessionKey]);

  // Save draft on text change
  useEffect(() => {
    setDraft(activeSessionKey, text);
  }, [text, activeSessionKey]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const newHeight = Math.min(el.scrollHeight, 180);
    el.style.height = newHeight + 'px';
  }, [text]);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  const handleSend = useCallback(async () => {
    // Read latest DOM value to avoid IME timing issues (composition may not have flushed into state yet).
    const rawText = textareaRef.current?.value ?? text;
    const trimmed = rawText.trim();
    if ((!trimmed && files.length === 0) || isSending || !connected || isHistoryWarmupGate) return;

    // On first interaction — load history before sending so context is visible
    if (messages.length === 0 && historyLoader) {
      await historyLoader();
    }

    setIsSending(true);

    const imageFiles = files.filter((f) => f.isImage);
    const previewImageAttachments = imageFiles
      .filter((f) => f.preview)
      .map((f) => ({ mimeType: f.mimeType, content: f.preview!, fileName: f.name }));
    let fullMessage = trimmed;
    let attachmentsForGateway: Array<{ type: string; mimeType: string; content: string; fileName: string }> | undefined;
    let usedManagedMarkers = false;

    try {
      const stageResult = await window.aegis?.attachments?.stage?.({
        sessionKey: activeSessionKey,
        files: files.map((file) => ({
          name: file.name,
          mimeType: file.mimeType,
          base64: file.base64 || undefined,
          sourcePath: file.path || undefined,
          size: file.size,
          isImage: file.isImage,
        })),
      });
      if (stageResult?.success && stageResult.staged.length > 0) {
        const markers = stageResult.staged.map((entry) => entry.marker);
        const markerText = markers.join('\n');
        fullMessage = fullMessage ? `${fullMessage}\n\n${markerText}` : markerText;
        usedManagedMarkers = true;
      } else if (files.length > 0) {
        throw new Error((stageResult as { error?: string } | undefined)?.error || 'failed to stage attachments');
      }
    } catch {
      const nonImageFiles = files.filter((f) => !f.isImage);
      const filePathRefs = nonImageFiles
        .map((f) => `📎 file: ${f.path || f.name} (${f.mimeType}, ${formatAttachmentSize(f.size)})`)
        .join('\n');
      if (filePathRefs) {
        fullMessage = fullMessage ? `${fullMessage}\n\n${filePathRefs}` : filePathRefs;
      }
      attachmentsForGateway = imageFiles.map((f) => ({
        type: 'base64',
        mimeType: f.mimeType,
        content: f.base64,
        fileName: f.name,
      }));
    }
    if (!fullMessage && files.length > 0) {
      fullMessage = `📎 ${files.map((f) => f.name).join(', ')}`;
    }

    const userMsg = {
      id: `user-${Date.now()}`, role: 'user' as const,
      content: fullMessage || '',
      timestamp: new Date().toISOString(),
      ...(!usedManagedMarkers && previewImageAttachments.length > 0 ? { attachments: previewImageAttachments } : {}),
    };
    addMessage(userMsg, activeSessionKey);

    setText('');
    setFiles([]);
    setIsTyping(true, activeSessionKey);
    useChatStore.getState().setQuickReplies([], activeSessionKey);

    try {
      await gateway.sendMessage(
        fullMessage || '',
        attachmentsForGateway && attachmentsForGateway.length > 0 ? attachmentsForGateway : undefined,
        activeSessionKey,
      );
    } catch (err) {
      console.error('[Send] Error:', err);
    } finally {
      setIsSending(false);
    }
  }, [
    text,
    files,
    isSending,
    connected,
    activeSessionKey,
    addMessage,
    setIsSending,
    setIsTyping,
    messages,
    historyLoader,
    isHistoryWarmupGate,
  ]);

  // File type icon based on MIME type
  const getFileIcon = (mimeType: string): string => {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType === 'application/pdf') return '📕';
    if (mimeType.startsWith('text/csv') || mimeType.includes('spreadsheet')) return '📊';
    if (mimeType.startsWith('text/')) return '📝';
    if (mimeType.includes('wordprocessing') || mimeType.includes('msword')) return '📘';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📙';
    if (mimeType.includes('zip') || mimeType.includes('compressed') || mimeType.includes('archive')) return '📦';
    if (mimeType.startsWith('audio/')) return '🎵';
    if (mimeType.startsWith('video/')) return '🎬';
    return '📄';
  };

  const handleFileSelect = async () => {
    const result = await window.aegis?.file.openDialog();
    if (result?.canceled || !result?.filePaths?.length) return;
    for (const filePath of result.filePaths) {
      const file = await window.aegis.file.read(filePath);
      if (file) {
        const isImage = file.mimeType?.startsWith('image/') ?? false;
        setFiles((prev) => [...prev, {
          name: file.name,
          base64: isImage ? file.base64 : '',  // Only store base64 for images
          mimeType: file.mimeType,
          isImage, size: file.size,
          preview: isImage ? `data:${file.mimeType};base64,${file.base64}` : undefined,
          path: filePath,  // Store original Windows path
        }]);
      }
    }
  };

  const handleScreenshotCapture = (dataUrl: string) => {
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    setFiles((prev) => [...prev, {
      name: `screenshot-${Date.now()}.png`, base64, mimeType: 'image/png',
      isImage: true, size: base64.length * 0.75, preview: dataUrl,
    }]);
    textareaRef.current?.focus();
  };

  const handleVoiceSend = useCallback(async (base64: string, mimeType: string, durationSec: number, previewUrl: string) => {
    if (!connected || isHistoryWarmupGate) return;
    setVoiceMode(false);
    addMessage({
      id: `user-${Date.now()}`, role: 'user',
      content: t('voice.voiceMessage', { seconds: durationSec }),
      timestamp: new Date().toISOString(),
      mediaUrl: previewUrl, mediaType: 'audio',
    }, activeSessionKey);
    setIsTyping(true, activeSessionKey);
    setIsSending(true);
    try {
      const ext = mimeType.includes('ogg') ? 'ogg' : 'webm';
      const filename = `voice-${Date.now()}.${ext}`;
      let savedPath = '';
      if (window.aegis?.voice?.save) {
        savedPath = await window.aegis.voice.save(filename, base64, activeSessionKey) || '';
      }
      if (savedPath) {
        await gateway.sendMessage(`🎤 [voice] ${savedPath} (${durationSec}s)`, undefined, activeSessionKey);
      } else {
        await gateway.sendMessage(
          `🎤 [voice:${mimeType}:base64] ${base64.substring(0, 50)}... (${durationSec}s)`,
          undefined,
          activeSessionKey,
        );
      }
    } catch (err) {
      console.error('[Voice] Send error:', err);
    } finally {
      setIsSending(false);
    }
  }, [addMessage, setIsTyping, setIsSending, t, activeSessionKey, connected, isHistoryWarmupGate]);

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob) continue;
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
          setFiles((prev) => [...prev, {
            name: 'clipboard.png', base64, mimeType: 'image/png',
            isImage: true, size: blob.size, preview: dataUrl,
          }]);
        };
        reader.readAsDataURL(blob);
        break;
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    for (const file of Array.from(e.dataTransfer.files)) {
      const isImage = file.type.startsWith('image/');
      const filePath = (file as any).path || '';  // Electron adds .path to File objects

      if (isImage) {
        // Images: read base64 for preview + attachment
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
          setFiles((prev) => [...prev, {
            name: file.name, base64, mimeType: file.type,
            isImage: true, size: file.size,
            preview: dataUrl, path: filePath,
          }]);
        };
        reader.readAsDataURL(file);
      } else {
        // Non-images: store path only (no base64 needed)
        setFiles((prev) => [...prev, {
          name: file.name, base64: '', mimeType: file.type || 'application/octet-stream',
          isImage: false, size: file.size, path: filePath,
        }]);
      }
    }
  };

  const removeFile = (index: number) => setFiles((prev) => prev.filter((_, i) => i !== index));

  return (
    <div className="shrink-0 border-t border-[rgb(var(--aegis-overlay)/0.04)] bg-[var(--aegis-bg-frosted-60)] backdrop-blur-xl">
      {/* File Previews */}
      {files.length > 0 && (
        <div className="flex gap-2 px-4 pt-3 overflow-x-auto scrollbar-hidden">
          {files.map((file, i) => (
            <div key={i} className="relative shrink-0 w-[72px] h-[72px] rounded-xl border border-aegis-border/40 overflow-hidden bg-aegis-surface group">
              {file.isImage && file.preview ? (
                <img src={file.preview} alt={file.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-1">
                  <span className="text-xl">{getFileIcon(file.mimeType)}</span>
                  <span className="text-[8px] text-aegis-text-dim truncate w-full text-center mt-0.5">{file.name}</span>
                </div>
              )}
              <button onClick={() => removeFile(i)}
                className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-aegis-danger/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <X size={9} className="text-aegis-text" />
              </button>
              <div className="absolute bottom-0 left-0 right-0 bg-aegis-bg-solid/80 text-[7px] text-center text-aegis-text py-0.5">
                {formatAttachmentSize(file.size)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Input Area */}
      {voiceMode ? (
        <VoiceRecorder
          onSendVoice={handleVoiceSend}
          onCancel={() => setVoiceMode(false)}
          disabled={!connected || isHistoryWarmupGate}
        />
      ) : (
        <div className="flex items-end gap-2 p-3" dir={dir}>
          {/* Input Wrapper (matches mockup) */}
          <div className={clsx(
            'flex items-center gap-2 px-3 py-2 rounded-2xl flex-1',
            'bg-aegis-surface border border-[rgb(var(--aegis-overlay)/0.06)]',
            'transition-all duration-200',
            'focus-within:border-aegis-primary/30',
            'focus-within:shadow-[0_0_0_3px_rgb(var(--aegis-primary)/0.06),0_0_16px_rgb(var(--aegis-primary)/0.08)]',
            !connected && 'opacity-40'
          )} onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
            {/* Action Buttons */}
            <EmojiPicker
              onSelect={(emoji) => { setText((prev) => prev + emoji); textareaRef.current?.focus(); }}
              disabled={!connected}
            />
            {[
              { icon: Paperclip, action: handleFileSelect, title: t('input.attachFile') },
              { icon: Camera, action: () => setScreenshotOpen(true), title: t('input.screenshot') },
              {
                icon: Mic,
                action: () => setVoiceMode(true),
                title: t('input.voiceRecord'),
                disabled: !connected || isHistoryWarmupGate,
              },
            ].map(({ icon: Icon, action, title, disabled }) => (
              <button key={title} onClick={action} disabled={disabled}
                className={clsx(
                  'w-[34px] h-[34px] rounded-lg flex items-center justify-center flex-shrink-0',
                  'bg-[rgb(var(--aegis-overlay)/0.03)] border-none',
                  'text-aegis-text-muted hover:text-aegis-text-muted hover:bg-[rgb(var(--aegis-overlay)/0.07)]',
                  'transition-colors disabled:opacity-30'
                )}
                title={title}>
                <Icon size={16} />
              </button>
            ))}

            {/* Text Input */}
            <textarea ref={textareaRef} data-input="message" value={text} onChange={(e) => setText(e.target.value)}
              onCompositionStart={() => { isComposingRef.current = true; }}
              onCompositionEnd={() => { isComposingRef.current = false; }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || e.shiftKey) return;
                // Block Enter entirely while IME is composing (e.g. confirming "IBM" in Chinese mode).
                // nativeEvent.isComposing is the reliable W3C flag; isComposingRef covers browsers
                // where the flag fires slightly late.
                const nativeIsComposing = (e.nativeEvent as { isComposing?: boolean }).isComposing;
                if (isComposingRef.current || nativeIsComposing) {
                  e.preventDefault();
                  return;
                }
                e.preventDefault();
                handleSend();
              }}
              onPaste={handlePaste}
              placeholder={
                isHistoryWarmupGate
                  ? t('input.placeholderHistoryLoading')
                  : connected
                    ? t('input.placeholder')
                    : t('input.placeholderDisconnected')
              }
              disabled={!connected}
              className={clsx(
                'flex-1 resize-none bg-transparent border-none text-[14px]',
                'text-aegis-text placeholder:text-aegis-text-muted',
                'focus:outline-none py-1.5 px-1',
                'max-h-[180px] scrollbar-hidden'
              )}
              dir={dir} rows={1} />

            {/* Send / Stop Button */}
            {isTyping || isSending ? (
              <button onClick={async () => {
                try {
                  await gateway.abortChat(activeSessionKey);
                  setIsTyping(false, activeSessionKey);
                  setIsSending(false);
                } catch (err) {
                  console.error('[Abort] Error:', err);
                }
              }}
                className="w-[34px] h-[34px] rounded-lg flex items-center justify-center flex-shrink-0 bg-aegis-danger/80 hover:bg-aegis-danger text-aegis-text transition-all"
                title={t('input.stop')}>
                <Square size={16} fill="currentColor" />
              </button>
            ) : (
              <button onClick={handleSend}
                disabled={(!text.trim() && files.length === 0) || !connected || isHistoryWarmupGate}
                className={clsx(
                  'w-[34px] h-[34px] rounded-lg flex items-center justify-center flex-shrink-0 transition-all',
                  text.trim() || files.length > 0
                    ? 'bg-gradient-to-br from-aegis-primary to-aegis-primary/70 text-aegis-bg shadow-[0_2px_8px_rgb(var(--aegis-primary)/0.3)] hover:shadow-[0_4px_16px_rgb(var(--aegis-primary)/0.4)] hover:-translate-y-px'
                    : 'bg-[rgb(var(--aegis-overlay)/0.04)] text-aegis-text-dim',
                  'disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none'
                )}
                title={isHistoryWarmupGate ? t('input.historyLoading') : t('input.send')}>
                <Send size={16} className={dir === 'rtl' ? 'rotate-180' : ''} />
              </button>
            )}
          </div>
        </div>
      )}

      <ScreenshotPicker open={screenshotOpen} onClose={() => setScreenshotOpen(false)} onCapture={handleScreenshotCapture} />
    </div>
  );
}
