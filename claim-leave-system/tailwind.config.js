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
          50: '#FCEEE3',
          100: '#F6DCC5',
          300: '#E9A876',
          500: '#DA7530',
          600: '#CD5B15',
          700: '#A84B11',
        },
        chrome: '#960000',
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
        card: '18px',
      },
      boxShadow: {
        card: '0 8px 28px rgba(160, 80, 40, 0.07), 0 1px 3px rgba(160, 80, 40, 0.06)',
        pill: '0 8px 18px rgba(205, 91, 21, 0.30)',
      },
      backgroundImage: {
        // soft warm page background, and the brand gradient used for the active menu item and main buttons
        app: 'linear-gradient(135deg, #FFF6EE 0%, #FDEDEE 50%, #F8EFF5 100%)',
        accent: 'linear-gradient(135deg, #EB8A3F 0%, #D2501F 55%, #B8301F 100%)',
      },
    },
  },
  plugins: [],
}
