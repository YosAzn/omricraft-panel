import React, { useRef } from 'react';
import { Camera, ImageIcon } from 'lucide-react';

export default function ImageUploader({ iconUrl, setIconUrl, t, size = 'lg' }) {
  const fileInputRef = useRef(null);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setIconUrl(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const dimensions = size === 'lg' ? 'w-24 h-24 sm:w-32 sm:h-32' : 'w-16 h-16';
  const iconSize = size === 'lg' ? 32 : 20;

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        onClick={() => fileInputRef.current.click()}
        className={`relative ${dimensions} rounded-2xl border-2 border-dashed flex items-center justify-center cursor-pointer transition-all overflow-hidden group
          ${iconUrl ? 'border-zinc-700 bg-zinc-900' : 'border-zinc-700 hover:border-green-500 hover:bg-green-500/10 bg-zinc-950'}`}
        title={t('uploadIcon')}
      >
        {iconUrl ? (
          <>
            <img src={iconUrl} alt="Server Logo" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
               <Camera size={iconSize} className="text-white"/>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center text-zinc-500 group-hover:text-green-500 transition-colors">
            <ImageIcon size={iconSize} className="mb-2" />
            {size === 'lg' && <span className="text-xs font-bold">{t('uploadIcon')}</span>}
          </div>
        )}
        <input
          type="file"
          accept="image/png, image/jpeg, image/gif"
          className="hidden"
          ref={fileInputRef}
          onChange={handleImageChange}
        />
      </div>
      {iconUrl && size === 'lg' && (
        <button type="button" onClick={() => setIconUrl(null)} className="text-xs text-red-400 hover:text-red-300 transition-colors">
          {t('removeIcon')}
        </button>
      )}
    </div>
  );
}
