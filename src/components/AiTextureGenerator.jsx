import React, { useState, useRef, useEffect } from 'react';
import { Palette, Sparkles, Loader2, Download, Image as ImageIcon } from 'lucide-react';
import JSZip from 'jszip';
import { generateTextureFn } from '../lib/api';

// Curated map of common blocks/items → their resource-pack texture path.
// block/ vs item/ matters: Minecraft looks up block textures under
// assets/minecraft/textures/block/* and items under .../item/*.
const TEXTURE_TARGETS = [
  { label: 'Diamond Block',  path: 'block/diamond_block' },
  { label: 'Gold Block',     path: 'block/gold_block' },
  { label: 'Iron Block',     path: 'block/iron_block' },
  { label: 'Dirt',           path: 'block/dirt' },
  { label: 'Stone',          path: 'block/stone' },
  { label: 'Grass Block',    path: 'block/grass_block_top' },
  { label: 'Oak Planks',     path: 'block/oak_planks' },
  { label: 'Diamond Ore',    path: 'block/diamond_ore' },
  { label: 'Crafting Table', path: 'block/crafting_table_top' },
  { label: 'Chest',          path: 'block/oak_planks' },
  { label: 'TNT',            path: 'block/tnt_side' },
  { label: 'Diamond Sword',  path: 'item/diamond_sword' },
  { label: 'Bow',            path: 'item/bow' },
  { label: 'Apple',          path: 'item/apple' },
  { label: 'Bread',          path: 'item/bread' },
];

// Resource-pack format. 75 = MC 1.21.11 (the panel's target version).
// (34 = 1.21.0–1.21.1, 46 = 1.21.4, 75 = 1.21.11.) supported_formats widens the
// band so 1.21.x clients don't warn "made for an older version of Minecraft".
const PACK_FORMAT = 75;
const PACK_SUPPORTED_FORMATS = { min_inclusive: 46, max_inclusive: 75 };

// `open` is controlled by the parent (GlobalRepository) so this tool toggles
// from the unified admin tool-button row, like the other tools — no internal
// header toggle of its own.
export default function AiTextureGenerator({ t, open = false }) {
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('free'); // 'free' | 'gemini'
  const [target, setTarget] = useState(TEXTURE_TARGETS[0].path);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rawImage, setRawImage] = useState(''); // data URL of the AI image
  const [usedFallback, setUsedFallback] = useState(false);
  const [pixelReady, setPixelReady] = useState(false);
  const canvasRef = useRef(null); // 16×16 nearest-neighbor canvas — the texture

  // Draw the AI image onto the 16×16 canvas with smoothing OFF (pixel art).
  const renderPixelated = (dataUrl) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, 16, 16);
      ctx.drawImage(img, 0, 0, 16, 16);
      setPixelReady(true);
    };
    img.onerror = () => setError(t('textureGenError'));
    img.src = dataUrl;
  };

  // Pixelate AFTER the canvas mounts. On the first generation the canvas is gated
  // behind {rawImage && ...}, so it isn't in the DOM when handleGenerate runs —
  // driving it from an effect guarantees canvasRef.current is set before drawing.
  useEffect(() => {
    if (rawImage) renderPixelated(rawImage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawImage]);

  const handleGenerate = async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError('');
    setRawImage('');
    setPixelReady(false);
    setUsedFallback(false);
    try {
      const res = await generateTextureFn({ prompt: prompt.trim(), model });
      const data = res?.data;
      if (!data?.success || !data?.image) throw new Error(data?.error || t('textureGenError'));
      setUsedFallback(!!data.usedFallback);
      setRawImage(data.image);
    } catch (e) {
      console.error('AI texture generation failed:', e);
      setError(e?.message || t('textureGenError'));
    } finally {
      setLoading(false);
    }
  };

  // Build a minimal resource pack in-browser (JSZip) and trigger a download.
  const handleDownloadPack = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !pixelReady) return;
    try {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error(t('textureGenError'));
      const zip = new JSZip();
      zip.file('pack.mcmeta', JSON.stringify({
        pack: {
          pack_format: PACK_FORMAT,
          supported_formats: PACK_SUPPORTED_FORMATS,
          description: 'OmriCraft AI texture',
        },
      }, null, 2));
      zip.file(`assets/minecraft/textures/${target}.png`, blob);
      const out = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(out);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${target.split('/').pop()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Resource pack build failed:', e);
      setError(e?.message || t('textureGenError'));
    }
  };

  // Controlled by the parent: render nothing when closed, so the row button
  // (not an internal toggle) drives visibility like the other admin tools.
  if (!open) return null;

  return (
    <div className="bg-zinc-900 border border-teal-500/30 rounded-xl mb-6 shadow-[0_0_15px_rgba(20,184,166,0.12)] overflow-hidden animate-in slide-in-from-top-4">
      <div className="flex items-center gap-2 px-5 pt-4">
        <Palette size={20} className="text-teal-400" />
        <span className="font-bold text-teal-300">{t('textureGen')}</span>
        <Sparkles size={15} className="text-teal-400/60 ml-auto" />
      </div>

      <div className="px-5 pb-5 pt-3 animate-in slide-in-from-top-2">
          <p className="text-xs text-zinc-400 mb-4">{t('textureGenDesc')}</p>

          <div className="flex flex-col md:flex-row gap-3 mb-3">
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleGenerate(); }}
              placeholder={t('texturePromptPlaceholder')}
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white outline-none focus:border-teal-500"
            />
            <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800">
              {['free', 'gemini'].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setModel(m)}
                  className={`px-3 py-1.5 rounded-md text-sm font-bold transition-all whitespace-nowrap ${model === m ? 'bg-teal-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
                >
                  {m === 'free' ? t('textureModelFree') : t('textureModelGemini')}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-3 mb-4">
            <div className="flex-1">
              <label className="block text-xs text-zinc-400 mb-1">{t('textureTarget')}</label>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white outline-none focus:border-teal-500"
              >
                {TEXTURE_TARGETS.map((tt) => (
                  <option key={tt.path} value={tt.path}>{tt.label} — {tt.path}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!prompt.trim() || loading}
              className="bg-teal-600 hover:bg-teal-500 text-white px-5 py-2 rounded-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50 self-end"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              {loading ? t('generatingTexture') : t('generateTexture')}
            </button>
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-3">{error}</div>
          )}
          {usedFallback && (
            <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-3">{t('textureGenFallbackNote')}</div>
          )}

          {!rawImage && !loading && !error && (
            <div className="flex items-center justify-center gap-2 text-zinc-500 text-sm py-8 border border-dashed border-zinc-800 rounded-lg">
              <ImageIcon size={16} /> {t('textureGenEmpty')}
            </div>
          )}

          {rawImage && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
              <div>
                <div className="text-xs text-zinc-400 mb-1">{t('textureRawPreview')}</div>
                <img src={rawImage} alt="raw" className="w-full max-w-[256px] rounded-lg border border-zinc-800 bg-zinc-950" />
              </div>
              <div>
                <div className="text-xs text-zinc-400 mb-1">{t('texturePixelPreview')}</div>
                <canvas
                  ref={canvasRef}
                  width={16}
                  height={16}
                  className="w-[128px] h-[128px] rounded-lg border border-zinc-800 bg-zinc-950"
                  style={{ imageRendering: 'pixelated' }}
                />
                <button
                  type="button"
                  onClick={handleDownloadPack}
                  disabled={!pixelReady}
                  className="mt-3 bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 disabled:opacity-50"
                >
                  <Download size={16} /> {t('downloadResourcePack')}
                </button>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
