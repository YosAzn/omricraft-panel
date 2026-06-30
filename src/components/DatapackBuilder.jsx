import React, { useState } from 'react';
import { Boxes, Sparkles, Loader2, Download, Search, ExternalLink, AlertTriangle, FileCode } from 'lucide-react';
import JSZip from 'jszip';
import { suggestDatapacksFn, generateDatapackFn } from '../lib/api';

// Admin-only Datapack Builder. Two modes:
//   'modrinth' — free keyless Modrinth search for REAL datapacks (link-out only).
//   'ai'       — generate a NEW datapack via the free Pollinations LLM (or Gemini),
//                then JSZip-pack it client-side and download <namespace>.zip.
// `open` is controlled by the parent (GlobalRepository) tool-button row, like the
// other admin tools — no internal header toggle. Pink accent. Download-only MVP:
// AI datapacks are NOT auto-installed (they can carry invalid JSON that crashes a
// live server), so we show a loud EXPERIMENTAL warning.
const MC_VERSION = '1.21.11';

export default function DatapackBuilder({ t, open = false }) {
  const [mode, setMode] = useState('modrinth'); // 'modrinth' | 'ai'
  const [model, setModel] = useState('free');    // 'free' | 'gemini' (AI mode)
  const [text, setText] = useState('');          // theme (modrinth) or prompt (ai)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState(null);   // Modrinth datapacks[] | null
  const [generated, setGenerated] = useState(null); // { namespace, files[], usedFallback } | null

  const reset = () => { setError(''); setResults(null); setGenerated(null); setSearched(true); };

  const handleSearch = async () => {
    if (!text.trim() || loading) return;
    setLoading(true); reset();
    try {
      const res = await suggestDatapacksFn({ theme: text.trim(), mcVersion: MC_VERSION });
      const data = res?.data;
      if (!data?.success) throw new Error(data?.error || t('datapackNoResults'));
      setResults(data.datapacks || []);
    } catch (e) {
      console.error('Datapack search failed:', e);
      setError(e?.message || String(e));
    } finally { setLoading(false); }
  };

  const handleGenerate = async () => {
    if (!text.trim() || loading) return;
    setLoading(true); reset();
    try {
      const res = await generateDatapackFn({ prompt: text.trim(), model, mcVersion: MC_VERSION });
      const data = res?.data;
      if (!data?.success || !Array.isArray(data?.files) || !data.files.length) {
        throw new Error(data?.error || t('datapackNoResults'));
      }
      setGenerated(data);
    } catch (e) {
      console.error('Datapack generation failed:', e);
      setError(e?.message || String(e));
    } finally { setLoading(false); }
  };

  // Zip every returned file at its own path (pack.mcmeta already carries the
  // correct injected datapack pack_format) and download <namespace>.zip.
  const handleDownloadZip = async () => {
    if (!generated?.files?.length) return;
    try {
      const zip = new JSZip();
      for (const f of generated.files) {
        if (!f || typeof f.path !== 'string' || typeof f.content !== 'string') continue;
        zip.file(f.path, f.content);
      }
      const out = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(out);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(generated.namespace || 'datapack').replace(/[^a-z0-9_-]/gi, '') || 'datapack'}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Datapack zip build failed:', e);
      setError(e?.message || String(e));
    }
  };

  if (!open) return null;

  const run = mode === 'ai' ? handleGenerate : handleSearch;

  return (
    <div className="bg-zinc-900 border border-orange-500/30 rounded-xl mb-6 shadow-[0_0_15px_rgba(249,115,22,0.12)] overflow-hidden animate-in slide-in-from-top-4">
      <div className="flex items-center gap-2 px-5 pt-4">
        <Boxes size={20} className="text-orange-400" />
        <span className="font-bold text-orange-300">{t('datapackBuilder')}</span>
        <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800 ml-auto">
          {[['modrinth', t('datapackModeModrinth')], ['ai', t('datapackModeAi')]].map(([m, label]) => (
            <button key={m} type="button" onClick={() => { setMode(m); reset(); setSearched(false); }}
              className={`px-3 py-1.5 rounded-md text-sm font-bold transition-all whitespace-nowrap ${mode === m ? 'bg-orange-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 pb-5 pt-3 animate-in slide-in-from-top-2">
        <p className="text-xs text-zinc-400 mb-4">{t('datapackBuilderDesc')}</p>

        <div className="flex flex-col md:flex-row gap-3 mb-3">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
            placeholder={mode === 'ai' ? t('datapackPromptPlaceholder') : t('datapackThemePlaceholder')}
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white outline-none focus:border-orange-500"
          />
          {mode === 'ai' && (
            <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800">
              {['free', 'gemini'].map((m) => (
                <button key={m} type="button" onClick={() => setModel(m)}
                  className={`px-3 py-1.5 rounded-md text-sm font-bold transition-all whitespace-nowrap ${model === m ? 'bg-orange-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
                  {m === 'free' ? t('builderModelFree') : t('builderModelGemini')}
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={run} disabled={!text.trim() || loading}
            className="bg-orange-600 hover:bg-orange-500 text-white px-5 py-2 rounded-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 size={18} className="animate-spin" /> : (mode === 'ai' ? <Sparkles size={18} /> : <Search size={18} />)}
            {loading ? (mode === 'ai' ? t('datapackGenerating') : t('datapackSearching')) : (mode === 'ai' ? t('datapackGenerate') : t('datapackSearch'))}
          </button>
        </div>

        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-3">{error}</div>
        )}
        {generated?.usedFallback && (
          <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-3">{t('datapackFallbackNote')}</div>
        )}

        {!loading && !error && !results && !generated && (
          <div className="flex items-center justify-center gap-2 text-zinc-500 text-sm py-8 border border-dashed border-zinc-800 rounded-lg">
            <Boxes size={16} /> {t('datapackEmpty')}
          </div>
        )}

        {/* Modrinth results — real datapacks, link-out only. */}
        {mode === 'modrinth' && results && results.length > 0 && (
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 max-h-72 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2">
            {results.map((d) => (
              <div key={d.slug} className="flex items-start justify-between gap-2 p-2 rounded-md border border-transparent hover:border-zinc-800 hover:bg-zinc-900 transition-colors">
                <div className="min-w-0">
                  <div className="font-bold text-sm truncate">{d.title}</div>
                  <p className="text-[11px] text-zinc-400 line-clamp-2">{d.description}</p>
                  <div className="text-[10px] text-zinc-500 mt-1 flex items-center gap-1">
                    <Download size={11} /> {typeof d.downloads === 'number' ? d.downloads.toLocaleString() : d.downloads} {t('builderDownloads')}
                  </div>
                </div>
                <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:text-orange-300 flex-shrink-0 p-1" title={d.url}>
                  <ExternalLink size={15} />
                </a>
              </div>
            ))}
          </div>
        )}
        {mode === 'modrinth' && searched && !loading && !error && results && results.length === 0 && (
          <div className="text-center text-zinc-500 py-6 text-sm">{t('datapackNoResults')}</div>
        )}

        {/* AI-generated datapack — file peek + experimental warning + download. */}
        {mode === 'ai' && generated && (
          <div className="animate-in fade-in">
            <div className="flex items-start gap-2 text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 mb-3">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-bold uppercase tracking-wide mr-1">{t('datapackExperimental')}</span>
                {t('datapackExperimentalNote')}
              </div>
            </div>
            <div className="text-xs text-zinc-400 mb-1">{t('datapackFiles')} — <span className="text-orange-300 font-mono">{generated.namespace}</span></div>
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 max-h-60 overflow-y-auto space-y-1 mb-3">
              {generated.files.map((f, i) => (
                <details key={i} className="rounded-md border border-transparent hover:border-zinc-800">
                  <summary className="flex items-center gap-2 p-1.5 cursor-pointer text-[12px] font-mono text-zinc-300">
                    <FileCode size={13} className="text-orange-400 flex-shrink-0" /> <span className="truncate">{f.path}</span>
                  </summary>
                  <pre className="text-[10px] text-zinc-500 whitespace-pre-wrap break-all px-2 pb-2 max-h-32 overflow-y-auto">{String(f.content || '').slice(0, 600)}</pre>
                </details>
              ))}
            </div>
            <button type="button" onClick={handleDownloadZip}
              className="bg-orange-600 hover:bg-orange-500 text-white px-5 py-2 rounded-lg font-bold flex items-center gap-2">
              <Download size={16} /> {t('datapackDownloadZip')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
