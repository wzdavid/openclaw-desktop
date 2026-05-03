// ═══════════════════════════════════════════════════════════
// Config Manager — Shared Components
// All styles: aegis-* Tailwind classes only
// ═══════════════════════════════════════════════════════════

import { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Star, X, Save, ChevronDown, CheckCircle2, Image } from 'lucide-react';
import clsx from 'clsx';
import type { ModelEntry } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// 1. MaskedInput — password input with show/hide toggle
// ─────────────────────────────────────────────────────────────────────────────

interface MaskedInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}

export function MaskedInput({ value, onChange, placeholder, className, id }: MaskedInputProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={clsx(
          'w-full bg-aegis-surface border border-aegis-border rounded-lg px-3 py-2 pr-20',
          'text-aegis-text text-sm font-mono placeholder:text-aegis-text-muted',
          'outline-none focus:border-aegis-primary transition-colors duration-200',
          className
        )}
        spellCheck={false}
        autoComplete="off"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className={clsx(
          'absolute right-2 top-1/2 -translate-y-1/2',
          'flex items-center gap-1 px-2 py-1 rounded text-xs font-bold',
          'bg-aegis-primary/10 text-aegis-primary border border-aegis-primary/20',
          'hover:bg-aegis-primary/20 transition-colors duration-200'
        )}
      >
        {visible ? (
          <><EyeOff size={11} /> {t('common.hide', 'Hide')}</>
        ) : (
          <><Eye size={11} /> {t('common.show', 'Show')}</>
        )}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. ChipList — model chips with alias + star (primary) + remove
// ─────────────────────────────────────────────────────────────────────────────

interface ChipListProps {
  models: Record<string, ModelEntry>;
  primaryModel?: string;
  imageModel?: string;
  imageSupportMap?: Map<string, boolean>;
  onRemove?: (id: string) => void;
  onSetPrimary?: (id: string) => void;
  onSetImageModel?: (id: string) => void;
  disabled?: boolean;
}

export function ChipList({
  models,
  primaryModel,
  imageModel,
  imageSupportMap,
  onRemove,
  onSetPrimary,
  onSetImageModel,
  disabled = false,
}: ChipListProps) {
  const { t } = useTranslation();
  const entries = Object.entries(models);

  if (entries.length === 0) {
    return (
      <p className="text-xs text-aegis-text-muted italic py-1">
        {t('config.noModelsConfigured', 'No models configured')}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([id, entry]) => {
        const isPrimary = id === primaryModel || entry.alias === primaryModel;
        const isImagePrimary = id === imageModel || entry.alias === imageModel;
        const supportsImage = imageSupportMap?.get(id) === true;
        return (
          <div
            key={id}
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1',
              'border text-sm transition-all duration-200',
              disabled && 'opacity-60',
              isPrimary
                ? 'border-aegis-primary/30 bg-aegis-primary/10 text-aegis-text'
                : 'border-aegis-border bg-aegis-surface text-aegis-text-secondary'
            )}
          >
            {/* model id */}
            <span className="max-w-[160px] truncate text-xs">{id}</span>

            {/* alias badge */}
            {entry.alias && (
              <span className="bg-aegis-primary/10 text-aegis-primary border border-aegis-primary/20 rounded px-1 text-[9px] font-bold uppercase tracking-wide">
                {entry.alias}
              </span>
            )}

            {/* star — primary toggle */}
            {onSetPrimary && (
              <button
                onClick={() => onSetPrimary(id)}
                disabled={disabled}
                title={isPrimary
                  ? t('config.primaryModel', 'Primary model')
                  : t('config.setPrimary', 'Set as Primary')}
                className={clsx(
                  'transition-transform hover:scale-125',
                  disabled && 'cursor-not-allowed hover:scale-100'
                )}
              >
                <Star
                  size={11}
                  className={isPrimary ? 'text-yellow-400 fill-yellow-400' : 'text-aegis-text-muted'}
                />
              </button>
            )}

            {onSetImageModel && (
              <button
                onClick={() => onSetImageModel(id)}
                disabled={disabled || !supportsImage}
                title={
                  !supportsImage
                    ? t('config.imageModelUnavailableHint', 'Image support not declared for this model')
                    : isImagePrimary
                      ? t('config.imageModel', 'Image model')
                      : t('config.setImageModel', 'Set as Image Model')
                }
                className={clsx(
                  'transition-transform hover:scale-125',
                  (disabled || !supportsImage) && 'cursor-not-allowed hover:scale-100'
                )}
              >
                <Image
                  size={11}
                  className={
                    isImagePrimary
                      ? 'text-blue-400 fill-blue-400'
                      : supportsImage
                        ? 'text-aegis-text-muted'
                        : 'text-aegis-text-muted/50'
                  }
                />
              </button>
            )}

            {/* remove */}
            {onRemove && (
              <button
                onClick={() => onRemove(id)}
                disabled={disabled}
                title={t('common.remove', 'Remove')}
                className={clsx(
                  'text-aegis-text-muted hover:text-red-400 transition-colors',
                  disabled && 'cursor-not-allowed hover:text-aegis-text-muted'
                )}
              >
                <X size={12} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. StatCard — stat number + label
// ─────────────────────────────────────────────────────────────────────────────

interface StatCardProps {
  value: number | string;
  label: string;
  colorClass?: string;   // e.g. "text-aegis-primary"
}

export function StatCard({ value, label, colorClass = 'text-aegis-primary' }: StatCardProps) {
  return (
    <div className="flex-1 text-center">
      <div className={clsx('text-2xl font-extrabold', colorClass)}>{value}</div>
      <div className="text-[10px] text-aegis-text-muted uppercase tracking-wider mt-0.5">
        {label}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. TabButton — nav tab button
// ─────────────────────────────────────────────────────────────────────────────

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon?: string;
  label: string;
  badge?: number;
}

export function TabButton({ active, onClick, icon, label, badge }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium',
        'border-b-2 transition-all duration-200 whitespace-nowrap',
        active
          ? 'text-aegis-primary border-aegis-primary bg-white/[0.02]'
          : 'text-aegis-text-muted border-transparent hover:text-aegis-text-secondary hover:bg-white/[0.02]'
      )}
    >
      {icon && <span>{icon}</span>}
      <span>{label}</span>
      {badge != null && badge > 0 && (
        <span
          className={clsx(
            'text-[10px] font-bold px-1.5 py-0.5 rounded-full border',
            active
              ? 'bg-aegis-primary/10 text-aegis-primary border-aegis-primary/20'
              : 'bg-aegis-elevated text-aegis-text-muted border-aegis-border'
          )}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. FloatingSaveButton — fixed bottom-center save bar with discard
// ─────────────────────────────────────────────────────────────────────────────

interface FloatingSaveProps {
  hasChanges: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard?: () => void;
}

export function FloatingSaveButton({ hasChanges, saving, onSave, onDiscard }: FloatingSaveProps) {
  const { t } = useTranslation();
  if (!hasChanges) return null;

  return (
    <div
      className={clsx(
        'fixed bottom-6 left-1/2 -translate-x-1/2 z-50',
        'flex items-center gap-2 px-4 py-3 rounded-2xl',
        'bg-aegis-card-solid border border-aegis-border',
        'shadow-[0_4px_30px_rgba(0,0,0,0.4)]',
        'animate-[float-in_0.3s_ease-out]',
        'transition-all duration-200'
      )}
    >
      {onDiscard && (
        <button
          onClick={onDiscard}
          disabled={saving}
          className={clsx(
            'px-4 py-2 rounded-xl text-sm font-medium border',
            'border-aegis-border text-aegis-text-secondary',
            'hover:bg-white/[0.05] hover:border-aegis-border-hover',
            'transition-all duration-200',
            saving && 'opacity-50 cursor-not-allowed'
          )}
        >
          {t('config.discard')}
        </button>
      )}
      <button
        onClick={onSave}
        disabled={saving}
        className={clsx(
          'flex items-center gap-2 px-5 py-2.5 rounded-xl',
          'bg-aegis-primary text-aegis-btn-primary-text font-bold text-sm',
          'shadow-[0_4px_20px_rgba(var(--aegis-primary)/0.35)]',
          'hover:brightness-110 hover:-translate-y-0.5',
          'transition-all duration-200',
          saving && 'opacity-70 cursor-not-allowed'
        )}
      >
        <Save size={14} />
        {saving ? t('config.saving') : <>💾 {t('config.reviewAndSave')}</>}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. ChangesPill — header badge showing unsaved changes count
// ─────────────────────────────────────────────────────────────────────────────

interface ChangesPillProps {
  count?: number;
  label?: string;
}

export function ChangesPill({ count, label = 'unsaved changes' }: ChangesPillProps) {
  return (
    <span
      className={clsx(
        'text-xs px-2.5 py-1 rounded-full font-semibold border',
        'bg-yellow-400/10 text-yellow-400 border-yellow-400/20',
        'animate-pulse'
      )}
    >
      {count != null ? `${count} ` : ''}{label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. ExpandableCard — collapsible card with header + body
// ─────────────────────────────────────────────────────────────────────────────

interface ExpandableCardProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  defaultExpanded?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function ExpandableCard({
  title,
  subtitle,
  icon,
  badge,
  defaultExpanded = false,
  children,
  className,
}: ExpandableCardProps) {
  const [open, setOpen] = useState(defaultExpanded);

  return (
    <div className={clsx('rounded-xl border border-aegis-border', className)}>
      {/* header */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'w-full flex items-center justify-between px-4 py-3.5',
          'bg-aegis-elevated text-left transition-all duration-200',
          'hover:bg-white/[0.02]',
          open ? 'rounded-t-xl border-b border-aegis-border' : 'rounded-xl'
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          {icon && (
            <span className="flex-shrink-0 text-aegis-text-muted">{icon}</span>
          )}
          <div className="min-w-0">
            <div className="font-semibold text-sm text-aegis-text">{title}</div>
            {subtitle && (
              <div className="text-[11px] text-aegis-text-muted truncate mt-0.5">{subtitle}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          {badge}
          <ChevronDown
            size={14}
            className={clsx(
              'text-aegis-text-muted transition-transform duration-200',
              open && 'rotate-180'
            )}
          />
        </div>
      </button>

      {/* body */}
      {open && (
        <div className="p-4 bg-white/[0.01] space-y-4 rounded-b-xl">
          {children}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. FormField — label + optional hint wrapper for any input
// ─────────────────────────────────────────────────────────────────────────────

interface FormFieldProps {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function FormField({ label, hint, required, children, className }: FormFieldProps) {
  return (
    <div className={clsx('flex flex-col gap-1', className)}>
      <label className="text-[10px] font-bold text-aegis-text-muted uppercase tracking-wider">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {children}
      {hint && (
        <p className="text-[10px] text-aegis-text-muted">{hint}</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. SelectField — styled <select> with aegis classes
// ─────────────────────────────────────────────────────────────────────────────

interface SelectFieldProps {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function SelectField({
  value,
  onChange,
  options,
  placeholder,
  className,
  disabled,
}: SelectFieldProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={clsx(
        'w-full bg-aegis-menu-bg border border-aegis-menu-border rounded-lg px-3 py-2',
        'text-aegis-text text-sm outline-none focus:border-aegis-primary',
        'transition-colors duration-200 cursor-pointer',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. ToggleSwitch — on/off toggle
// ─────────────────────────────────────────────────────────────────────────────

interface ToggleSwitchProps {
  value: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function ToggleSwitch({ value, onChange, label, disabled }: ToggleSwitchProps) {
  return (
    <label
      className={clsx(
        'inline-flex items-center gap-2.5 cursor-pointer select-none',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      {/* track */}
      <button
        type="button"
        role="switch"
        aria-checked={value}
        disabled={disabled}
        onClick={() => !disabled && onChange(!value)}
        className={clsx(
          'relative w-9 h-5 rounded-full border transition-all duration-200 flex-shrink-0',
          value
            ? 'bg-aegis-primary/80 border-aegis-primary/60'
            : 'bg-aegis-surface border-aegis-border hover:border-aegis-border-hover'
        )}
      >
        {/* thumb */}
        <span
          className={clsx(
            'absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200',
            'bg-white shadow-sm',
            value ? 'left-[18px]' : 'left-0.5'
          )}
        />
      </button>
      {label && (
        <span className="text-sm text-aegis-text-secondary">{label}</span>
      )}
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. ChipInput — input for adding/removing string chips
// ─────────────────────────────────────────────────────────────────────────────

interface ChipInputProps {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function ChipInput({ values, onChange, placeholder = 'Add...', className }: ChipInputProps) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const addChip = () => {
    const trimmed = input.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setInput('');
  };

  const removeChip = (v: string) => {
    onChange(values.filter((x) => x !== v));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addChip();
    } else if (e.key === 'Backspace' && input === '' && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div
      className={clsx(
        'flex flex-wrap gap-1.5 p-2 min-h-[38px]',
        'bg-aegis-surface border border-aegis-border rounded-lg',
        'focus-within:border-aegis-primary transition-colors duration-200 cursor-text',
        className
      )}
      onClick={() => inputRef.current?.focus()}
    >
      {values.map((v) => (
        <span
          key={v}
          className={clsx(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs',
            'bg-aegis-primary/10 border border-aegis-primary/20 text-aegis-primary'
          )}
        >
          {v}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); removeChip(v); }}
            className="text-aegis-primary/60 hover:text-aegis-primary transition-colors"
          >
            <X size={10} />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={addChip}
        placeholder={values.length === 0 ? placeholder : ''}
        className={clsx(
          'flex-1 min-w-[80px] bg-transparent text-aegis-text text-xs',
          'outline-none placeholder:text-aegis-text-muted'
        )}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. ConfirmDialog — modal for destructive action confirmation
// ─────────────────────────────────────────────────────────────────────────────

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  danger = false,
}: ConfirmDialogProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <div
        className={clsx(
          'bg-aegis-card-solid border border-aegis-border rounded-2xl w-full max-w-sm p-6',
          'shadow-[0_8px_30px_rgba(0,0,0,0.5)]',
          'animate-[pop-in_0.15s_ease-out]'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-bold text-sm text-aegis-text mb-2">{title}</h3>
        <p className="text-sm text-aegis-text-secondary mb-5">{message}</p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium',
              'border border-aegis-border text-aegis-text-secondary',
              'hover:bg-white/[0.03] hover:border-aegis-border-hover',
              'transition-all duration-200'
            )}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-bold',
              'transition-all duration-200',
              danger
                ? 'border border-red-500/30 text-red-400 bg-red-400/8 hover:bg-red-400/15 hover:border-red-500/50'
                : 'bg-aegis-primary text-aegis-btn-primary-text hover:brightness-110'
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. DiffPreviewModal — shows computed diff between original & current config
// ─────────────────────────────────────────────────────────────────────────────

interface DiffEntry {
  path: string;
  type: 'added' | 'removed' | 'changed';
  oldValue?: any;
  newValue?: any;
}

function isSensitiveKey(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.includes('token') ||
    lower.includes('key') ||
    lower.includes('secret') ||
    lower.includes('password')
  );
}

function maskValue(value: any): string {
  if (typeof value !== 'string') return '****';
  if (value.length <= 8) return '****';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function formatValue(path: string, value: any): string {
  if (value === undefined || value === null) return String(value);
  if (isSensitiveKey(path)) return maskValue(value);
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  if (str.length > 80) return str.slice(0, 80) + '...';
  return str;
}

function computeDiff(original: any, current: any, prefix = ''): DiffEntry[] {
  const entries: DiffEntry[] = [];

  // Both are plain objects (not arrays)
  if (
    original !== null &&
    current !== null &&
    typeof original === 'object' &&
    typeof current === 'object' &&
    !Array.isArray(original) &&
    !Array.isArray(current)
  ) {
    const allKeys = new Set([...Object.keys(original), ...Object.keys(current)]);
    for (const key of allKeys) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (!(key in original)) {
        entries.push({ path, type: 'added', newValue: current[key] });
      } else if (!(key in current)) {
        entries.push({ path, type: 'removed', oldValue: original[key] });
      } else {
        entries.push(...computeDiff(original[key], current[key], path));
      }
    }
    return entries;
  }

  // Arrays: compare as JSON string
  if (Array.isArray(original) && Array.isArray(current)) {
    if (JSON.stringify(original) !== JSON.stringify(current)) {
      if (prefix) entries.push({ path: prefix, type: 'changed', oldValue: original, newValue: current });
    }
    return entries;
  }

  // Primitives or mixed types
  if (original !== current && prefix) {
    if (original === undefined) {
      entries.push({ path: prefix, type: 'added', newValue: current });
    } else if (current === undefined) {
      entries.push({ path: prefix, type: 'removed', oldValue: original });
    } else {
      entries.push({ path: prefix, type: 'changed', oldValue: original, newValue: current });
    }
  }

  return entries;
}

function DiffRow({ diff }: { diff: DiffEntry }) {
  const badgeClass = {
    added:   'text-green-400 bg-green-400/10 border-green-400/20',
    removed: 'text-red-400 bg-red-400/10 border-red-400/20',
    changed: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  }[diff.type];

  const badgeLabel = {
    added:   '+ Added',
    removed: '- Removed',
    changed: '~ Changed',
  }[diff.type];

  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-aegis-elevated border border-aegis-border text-xs">
      <span className={clsx('shrink-0 font-bold px-2 py-0.5 rounded-full border text-[10px]', badgeClass)}>
        {badgeLabel}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-mono text-aegis-text-secondary truncate mb-1">{diff.path}</div>
        {diff.type !== 'added' && (
          <div className="text-red-400 font-mono truncate">
            {formatValue(diff.path, diff.oldValue)}
          </div>
        )}
        {diff.type !== 'removed' && (
          <div className="text-green-400 font-mono truncate">
            {formatValue(diff.path, diff.newValue)}
          </div>
        )}
      </div>
    </div>
  );
}

interface DiffPreviewModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  original: any;  // OpenClawConfig
  current: any;   // OpenClawConfig
  saving: boolean;
}

export function DiffPreviewModal({
  open,
  onClose,
  onConfirm,
  original,
  current,
  saving,
}: DiffPreviewModalProps) {
  const { t } = useTranslation();
  const diffs = useMemo(() => {
    if (!original || !current) return [];
    return computeDiff(original, current);
  }, [original, current]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className={clsx(
          'bg-aegis-card-solid border border-aegis-border rounded-2xl w-full max-w-3xl',
          'shadow-[0_8px_30px_rgba(0,0,0,0.5)] flex flex-col max-h-[80vh]',
          'animate-[pop-in_0.15s_ease-out]'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-aegis-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-sm text-aegis-text">
              {t('config.reviewChanges', 'Review Changes')}
            </h3>
            {diffs.length > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-400/10 text-yellow-400 border border-yellow-400/20">
                {diffs.length} changes
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-aegis-text-muted hover:text-aegis-text transition-colors p-1 rounded-lg hover:bg-white/[0.05]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {diffs.length === 0 ? (
            <div className="flex items-center gap-2 justify-center py-12 text-sm text-aegis-text-secondary">
              <CheckCircle2 size={16} className="text-aegis-primary" />
              <span>{t('config.noChanges', 'No changes detected')}</span>
            </div>
          ) : (
            diffs.map((diff, i) => <DiffRow key={i} diff={diff} />)
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-aegis-border flex-shrink-0">
          <button
            onClick={onClose}
            disabled={saving}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium border',
              'border-aegis-border text-aegis-text-secondary',
              'hover:bg-white/[0.03] hover:border-aegis-border-hover',
              'transition-all duration-200',
              saving && 'opacity-50 cursor-not-allowed'
            )}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={saving}
            className={clsx(
              'flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold',
              'bg-aegis-primary text-aegis-btn-primary-text',
              'hover:brightness-110 transition-all duration-200',
              saving && 'opacity-70 cursor-not-allowed'
            )}
          >
            <Save size={14} />
            {saving ? t('config.saving') : t('config.saveAndRestart')}
          </button>
        </div>
      </div>
    </div>
  );
}
