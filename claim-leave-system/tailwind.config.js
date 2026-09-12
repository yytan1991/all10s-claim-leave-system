/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          900: '#12212B',
          700: '#274653',
          500: '#4B6572',
        },
        brand: {
          50: '#EAF6F3',
          100: '#CFEBE3',
          300: '#7FC9B6',
          500: '#1E8A72',
          600: '#166F5C',
          700: '#0F5747',
        },
        sand: {
          50: '#FAF8F4',
          100: '#F2EEE5',
          200: '#E6E0D2',
        },
        amber: {
          50: '#FDF3E3',
          400: '#E0A526',
          600: '#A9740F',
        },
        rose: {
          50: '#FBEAEA',
          400: '#D06060',
          600: '#A63A3A',
        },
      },
      fontFamily: {
        display: ['"Fraunces"', 'serif'],
        body: ['"Inter"', 'sans-serif'],
      },
      borderRadius: {
        card: '10px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(18, 33, 43, 0.06), 0 1px 0 rgba(18, 33, 43, 0.04)',
      },
    },
  },
  plugins: [],
}
