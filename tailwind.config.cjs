/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  // darkMode removed — single theme system
  theme: {
    extend: {
      colors: {
        aegis: {
          // ── Backgrounds (direct CSS vars — no alpha needed) ──
          bg:             'var(--aegis-bg)',
          surface:        'var(--aegis-surface)',
          elevated:       'var(--aegis-elevated)',
          card:           'var(--aegis-card)',
          'bg-solid':     'var(--aegis-bg-solid)',
          'bg-frosted':   'var(--aegis-bg-frosted)',
          'bg-frosted-60':'var(--aegis-bg-frosted-60)',
          'surface-solid':'var(--aegis-surface-solid)',
          'elevated-solid':'var(--aegis-elevated-solid)',
          'card-solid':   'var(--aegis-card-solid)',
          chrome:         'var(--aegis-chrome)',

          // ── Borders (direct CSS vars) ──
          border:         'var(--aegis-border)',
          'border-hover': 'var(--aegis-border-hover)',
          'border-active':'var(--aegis-border-active)',

          // ── Text (RGB vars — alpha support via /XX) ──
          text:            'rgb(var(--aegis-text) / <alpha-value>)',
          'text-secondary':'rgb(var(--aegis-text-secondary) / <alpha-value>)',
          'text-muted':    'rgb(var(--aegis-text-muted) / <alpha-value>)',
          'text-dim':      'rgb(var(--aegis-text-dim) / <alpha-value>)',

          // ── Primary (RGB vars — alpha support) ──
          primary:         'rgb(var(--aegis-primary) / <alpha-value>)',
          'primary-hover': 'rgb(var(--aegis-primary-hover) / <alpha-value>)',
          'primary-deep':  'rgb(var(--aegis-primary-deep) / <alpha-value>)',
          'primary-glow':  'var(--aegis-primary-glow)',
          'primary-surface':'var(--aegis-primary-surface)',

          // ── Accent (RGB vars — alpha support) ──
          accent:          'rgb(var(--aegis-accent) / <alpha-value>)',
          'accent-hover':  'rgb(var(--aegis-accent-hover) / <alpha-value>)',
          'accent-glow':   'var(--aegis-accent-glow)',

          // ── Status (RGB vars — alpha support) ──
          danger:          'rgb(var(--aegis-danger) / <alpha-value>)',
          'danger-surface':'var(--aegis-danger-surface)',
          warning:         'rgb(var(--aegis-warning) / <alpha-value>)',
          'warning-surface':'var(--aegis-warning-surface)',
          success:         'rgb(var(--aegis-success) / <alpha-value>)',
          'success-surface':'var(--aegis-success-surface)',

          // ── Messages ──
          'user-bubble':   'var(--aegis-user-bubble)',
          'user-border':   'var(--aegis-user-border)',
          'bot-bubble':    'var(--aegis-bot-bubble)',
          'bot-border':    'var(--aegis-bot-border)',

          // ── Glass ──
          glass:           'var(--aegis-glass)',
          'glass-border':  'var(--aegis-glass-border)',
          'glass-hover':   'var(--aegis-glass-hover)',

          // ── Menus & Dropdowns ──
          'menu-bg':         'var(--aegis-menu-bg)',
          'menu-hover':      'var(--aegis-menu-hover)',
          'menu-active':     'var(--aegis-menu-active)',
          'menu-border':     'var(--aegis-menu-border)',
          'menu-text':       'var(--aegis-menu-text)',
          'menu-text-muted': 'var(--aegis-menu-text-muted)',

          // ── Button text ──
          'btn-primary-text':'var(--aegis-btn-primary-text)',
        },
      },
      fontFamily: {
        sans: ['IBM Plex Sans Arabic', 'SF Pro Display', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Fira Code', 'Consolas', 'monospace'],
        arabic: ['IBM Plex Sans Arabic', 'Segoe UI', 'Tahoma', 'sans-serif'],
      },
      boxShadow: {
        'glow-sm': '0 0 12px rgb(var(--aegis-primary) / 0.18)',
        'glow-md': '0 0 24px rgb(var(--aegis-primary) / 0.24)',
        'glow-lg': '0 4px 40px rgb(var(--aegis-primary) / 0.28)',
        'inner-glow': 'inset 0 1px 0 rgb(var(--aegis-overlay) / 0.05)',
        'glass': '0 8px 32px rgba(0,0,0,0.15), inset 0 1px 0 rgb(var(--aegis-overlay) / 0.04)',
        'glass-lg': '0 16px 48px rgba(0,0,0,0.2), inset 0 1px 0 rgb(var(--aegis-overlay) / 0.05)',
        'card': '0 2px 8px rgba(0,0,0,0.12), 0 0 1px rgb(var(--aegis-overlay) / 0.04)',
        'float': '0 8px 32px rgba(0,0,0,0.2)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-subtle': 'linear-gradient(135deg, rgb(var(--aegis-primary) / 0.04) 0%, rgb(var(--aegis-accent) / 0.04) 100%)',
        'gradient-surface': 'linear-gradient(180deg, rgb(var(--aegis-overlay) / 0.03) 0%, transparent 100%)',
        'gradient-glass': 'linear-gradient(135deg, rgb(var(--aegis-overlay) / 0.05) 0%, rgb(var(--aegis-overlay) / 0.01) 100%)',
        'shimmer': 'linear-gradient(90deg, transparent 0%, rgb(var(--aegis-primary) / 0.10) 50%, transparent 100%)',
      },
      animation: {
        'fade-in': 'fadeIn 0.25s ease-out',
        'fade-in-slow': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-down': 'slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-right': 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'pulse-ring': 'pulseRing 1.5s ease-out infinite',
        'typing-dot': 'typingDot 1.4s ease-in-out infinite',
        'shimmer': 'shimmer 2s ease-in-out infinite',
        'spin-slow': 'spin 3s linear infinite',
        'bounce-subtle': 'bounceSubtle 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'glow-pulse': 'glowPulse 3s ease-in-out infinite',
        'glow-teal': 'glowTeal 2.5s ease-in-out infinite',
        'glow-green': 'glowGreen 2s ease-in-out infinite',
        'glow-accent': 'glowAccent 3s ease-in-out infinite',
        'dot-pulse': 'dotPulse 2s ease-in-out infinite',
        'beacon': 'beacon 2s ease-in-out infinite',
        'shimmer-edge': 'shimmerEdge 3s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
        'icon-glow': 'iconGlow 2.5s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        slideDown: { '0%': { opacity: '0', transform: 'translateY(-8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        slideInRight: { '0%': { opacity: '0', transform: 'translateX(16px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        pulseSoft: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.5' } },
        pulseRing: { '0%': { transform: 'scale(0.95)', opacity: '1' }, '100%': { transform: 'scale(1.8)', opacity: '0' } },
        typingDot: { '0%, 60%, 100%': { transform: 'translateY(0)', opacity: '0.4' }, '30%': { transform: 'translateY(-6px)', opacity: '1' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        bounceSubtle: { '0%': { transform: 'scale(0.95)' }, '50%': { transform: 'scale(1.02)' }, '100%': { transform: 'scale(1)' } },
        glowPulse: { '0%, 100%': { boxShadow: '0 0 12px rgb(var(--aegis-primary) / 0.12)' }, '50%': { boxShadow: '0 0 24px rgb(var(--aegis-primary) / 0.28)' } },
        glowTeal: { '0%, 100%': { boxShadow: '0 0 6px rgb(var(--aegis-primary) / 0.2)' }, '50%': { boxShadow: '0 0 12px rgb(var(--aegis-primary) / 0.4)' } },
        glowGreen: { '0%, 100%': { boxShadow: '0 0 4px rgb(var(--aegis-success) / 0.3)', opacity: '1' }, '50%': { boxShadow: '0 0 10px rgb(var(--aegis-success) / 0.6)', opacity: '0.7' } },
        glowAccent: { '0%, 100%': { boxShadow: '0 0 8px rgb(var(--aegis-accent) / 0.15)' }, '50%': { boxShadow: '0 0 20px rgb(var(--aegis-accent) / 0.3)' } },
        dotPulse: { '0%, 100%': { transform: 'scale(1)', opacity: '1' }, '50%': { transform: 'scale(1.3)', opacity: '0.6' } },
        beacon: { '0%': { boxShadow: '0 0 0 0 rgb(var(--aegis-primary) / 0.4)' }, '70%': { boxShadow: '0 0 0 10px rgb(var(--aegis-primary) / 0)' }, '100%': { boxShadow: '0 0 0 0 rgb(var(--aegis-primary) / 0)' } },
        shimmerEdge: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        float: { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-3px)' } },
        iconGlow: { '0%, 100%': { filter: 'drop-shadow(0 0 2px rgb(var(--aegis-primary) / 0.3))' }, '50%': { filter: 'drop-shadow(0 0 6px rgb(var(--aegis-primary) / 0.6))' } },
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
    },
  },
  plugins: [],
};
