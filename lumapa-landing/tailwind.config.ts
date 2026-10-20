import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        spatial: '0 30px 100px rgba(0,0,0,.45)',
        glow: '0 0 60px rgba(90, 120, 255, .25)'
      }
    }
  },
  plugins: []
};
export default config;
