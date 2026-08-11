/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary-action green, sampled from the emerald crown of Yosef's
        // OmriCraft head logo (the character's "hair") so every solid green
        // button matches the brand mark. ONE source of truth — used as
        // bg-crown / hover:bg-crown-light across the app.
        crown: {
          DEFAULT: '#3d7f5d',
          light: '#54a47d',
        },
      },
    },
  },
  plugins: [],
}