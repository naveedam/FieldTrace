/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#12181F',
          800: '#1B232D',
          700: '#242F3B',
          600: '#374453'
        },
        paper: '#F7F7F5',
        line: '#DCDAD3',
        amber: {
          DEFAULT: '#F5A623',
          600: '#D6900E',
          100: '#FDF1DA'
        },
        signal: {
          green: '#2F9E5B',
          red: '#D64545',
          blue: '#3576D6'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"IBM Plex Mono"', 'monospace']
      },
      borderRadius: {
        none: '0px',
        sm: '2px',
        DEFAULT: '2px',
        md: '3px'
      },
      spacing: {
        tap: '44px'
      }
    }
  },
  plugins: []
};
