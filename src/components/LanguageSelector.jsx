import React from 'react';
import { Globe } from 'lucide-react';
import { LANGUAGES } from '../lib/i18n';

// Compact language picker — lists all supported languages by their NATIVE name.
// Selecting one calls setLang(code); the app's dir/RTL handling reacts to the
// new language automatically (see App.jsx documentElement.dir effect).
//
// A native <select> is used on purpose: it's keyboard/screen-reader friendly,
// needs no extra deps, and handles 10 options cleanly on mobile.
export default function LanguageSelector({ lang, setLang, title, className = '' }) {
  return (
    <label
      className={`relative inline-flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors ${className}`}
      title={title}
    >
      <Globe size={16} className="pointer-events-none flex-shrink-0" />
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value)}
        aria-label={title || 'Language'}
        className="appearance-none bg-transparent text-sm font-bold cursor-pointer pr-1 py-1.5 focus:outline-none [&>option]:bg-zinc-900 [&>option]:text-zinc-100"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
