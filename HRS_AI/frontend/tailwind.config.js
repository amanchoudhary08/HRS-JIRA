export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          0: '#08050f',
          1: 'rgba(255,255,255,0.045)',
          2: 'rgba(255,255,255,0.07)',
          3: 'rgba(255,255,255,0.1)',
        },
        arc: {
          DEFAULT: '#22d3ee',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          glow: 'rgba(34,211,238,0.15)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'Consolas', 'monospace'],
      },
      borderRadius: {
        'sm': '4px',
        DEFAULT: '6px',
        'md': '6px',
        'lg': '8px',
        'xl': '10px',
        '2xl': '12px',
        '3xl': '16px',
      },
      boxShadow: {
        glow: '0 0 20px -4px rgba(34,211,238,0.35)',
        'glow-sm': '0 0 12px -3px rgba(34,211,238,0.25)',
        'glow-indigo': '0 0 20px -4px rgba(99,102,241,0.35)',
        panel: '0 4px 32px -8px rgba(0,0,0,0.8)',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.8s infinite',
        'fade-up': 'fadeUp 0.2s ease-out both',
        'fade-in': 'fadeUp 0.2s ease-out both',
      },
    },
  },
  plugins: [],
}
