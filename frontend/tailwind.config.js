/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        institutional: {
          bg: '#09090b',         // zinc-950 base canvas
          card: '#18181b',       // zinc-900 surface cards
          cardHover: '#27272a',  // zinc-800 elevated hover
          border: '#27272a',     // zinc-800 borders
          subtle: '#3f3f46',     // zinc-700 subtle text/icons
          gain: '#34d399',       // emerald-400 for gains, bids, positive edge
          gainMuted: '#064e3b',  // emerald-950 for backgrounds
          loss: '#f87171',       // rose-400 for losses, asks, negative edge
          lossMuted: '#4c0519',  // rose-950 for backgrounds
          accent: '#38bdf8',     // sky-400 neutral accents and headers
          warning: '#fbbf24',    // amber-400 slippage/risk warnings
          danger: '#ef4444',     // red-500 hard kill-switch
          shin: '#c084fc',       // purple-400 Shin 1993 model badge
          weather: '#38bdf8',    // sky-400 Weather NWP model badge
          ai: '#34d399',         // emerald-400 AI ensemble model badge
        },
      },
      fontFamily: {
        mono: [
          'JetBrains Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'Liberation Mono',
          'Courier New',
          'monospace',
        ],
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
