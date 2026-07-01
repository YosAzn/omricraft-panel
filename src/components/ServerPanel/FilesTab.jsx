import React, { useState, useEffect, useRef } from 'react';
import {
  HardDrive, FileCode, AlertCircle, Save, X, Folder, FileText, Edit3, Trash2, Upload
} from 'lucide-react';
import { listFilesFn, readFileFn, writeFileFn, deleteFileFn, uploadServerFileFn } from '../../lib/api';

// Client-side size cap — must match the uploadServerFile callable (15 MB).
const UPLOAD_MAX_BYTES = 15 * 1024 * 1024;

// --- FILES TAB (real file manager via Manager API → VPS) ---
export default function FilesTab({ server, t, userRole }) {
  const [currentPath, setCurrentPath] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editingFile, setEditingFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [fileNote, setFileNote] = useState(null);
  const [savedMsg, setSavedMsg] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState(null);
  const fileInputRef = useRef(null);

  const pathStr = currentPath.join('/');

  const loadDir = async () => {
    setLoading(true); setError(null); setFileNote(null);
    try {
      const res = await listFilesFn({ serverId: server.id, path: pathStr });
      const d = res.data || res;
      if (d.success) setEntries(d.entries || []);
      else setError(d.error || t('filesLoadError'));
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => {
    if (!editingFile) loadDir();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.id, pathStr]);

  const openEntry = async (entry) => {
    if (entry.type === 'dir') { setCurrentPath([...currentPath, entry.name]); return; }
    setFileNote(null);
    try {
      const res = await readFileFn({ serverId: server.id, path: [...currentPath, entry.name].join('/') });
      const d = res.data || res;
      if (!d.success) { setFileNote(d.error || t('filesReadError')); return; }
      if (d.binary) { setFileNote(d.tooLarge ? t('filesTooLargeView') : t('filesBinary')); return; }
      setEditingFile(entry.name);
      setFileContent(d.content || '');
    } catch (e) { setFileNote(e.message); }
  };

  const navigateUp = (index) => {
    setEditingFile(null); setFileNote(null);
    setCurrentPath(index < 0 ? [] : currentPath.slice(0, index + 1));
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true); setFileNote(null);
    try {
      const res = await writeFileFn({ serverId: server.id, path: [...currentPath, editingFile].join('/'), content: fileContent });
      const d = res.data || res;
      if (d.success) { setSavedMsg(true); setTimeout(() => setSavedMsg(false), 4000); }
      else setFileNote(d.error || t('filesSaveError'));
    } catch (e) { setFileNote(e.message); }
    setSaving(false);
  };

  const handleDelete = async (entry, e) => {
    e.stopPropagation();
    if (userRole !== 'admin') return;
    if (!window.confirm(t('filesDeleteConfirm', { name: entry.name }))) return;
    setFileNote(null);
    try {
      const res = await deleteFileFn({ serverId: server.id, path: [...currentPath, entry.name].join('/') });
      const d = res.data || res;
      if (d.success) loadDir();
      else setFileNote(d.error || t('filesDeleteError'));
    } catch (err) { setFileNote(err.message); }
  };

  // Read a File as raw base64 (strip the "data:...;base64," prefix FileReader adds).
  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result || '';
      const comma = res.indexOf(',');
      resolve(comma >= 0 ? res.slice(comma + 1) : res);
    };
    reader.onerror = () => reject(reader.error || new Error(t('filesReadFailed')));
    reader.readAsDataURL(file);
  });

  const handleUploadClick = () => { setUploadMsg(null); fileInputRef.current?.click(); };

  const handleUpload = async (e) => {
    const file = e.target.files && e.target.files[0];
    // Reset the input so selecting the same file again re-triggers onChange.
    e.target.value = '';
    if (!file) return;
    setUploadMsg(null);

    const ext = (file.name.slice(file.name.lastIndexOf('.')) || '').toLowerCase();
    if (ext !== '.jar' && ext !== '.zip') {
      setUploadMsg(t('filesUploadTypeError')); return;
    }
    if (file.size > UPLOAD_MAX_BYTES) {
      const maxMb = Math.floor(UPLOAD_MAX_BYTES / (1024 * 1024));
      setUploadMsg(t('filesUploadSizeError', { maxMb })); return;
    }

    setUploading(true);
    try {
      const contentBase64 = await fileToBase64(file);
      const res = await uploadServerFileFn({ serverId: server.id, dir: pathStr, filename: file.name, contentBase64 });
      const d = res.data || res;
      if (!d.success) throw new Error(d.error || t('filesUploadFailed'));
      setUploadMsg(`✅ ${t('uploadOk')}: ${file.name}`);
      await loadDir();
    } catch (err) {
      console.error('FilesTab upload:', err);
      setUploadMsg(`${t('uploadFail')}: ${err.message}`);
      alert(`${t('uploadFail')}: ${err.message}`);
    }
    setUploading(false);
  };

  const fmtSize = (n) => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';

  return (
    <div className="h-full flex flex-col animate-in fade-in">
      {/* Breadcrumb */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex items-center gap-2 mb-4 overflow-x-auto text-sm font-bold">
        <button onClick={() => navigateUp(-1)} className="text-zinc-400 hover:text-white transition-colors flex items-center gap-1">
          <HardDrive size={16}/> {server.slug || 'Root'}
        </button>
        {currentPath.map((folder, idx) => (
          <React.Fragment key={idx}>
            <span className="text-zinc-600">/</span>
            <button onClick={() => navigateUp(idx)} className="text-zinc-400 hover:text-white transition-colors">{folder}</button>
          </React.Fragment>
        ))}
        {editingFile && (
          <>
            <span className="text-zinc-600">/</span>
            <span className="text-green-400 flex items-center gap-1"><FileCode size={16}/> {editingFile}</span>
          </>
        )}
        {!editingFile && userRole === 'admin' && (
          <button
            onClick={handleUploadClick}
            disabled={uploading}
            title={t('uploadHint')}
            className="ml-auto bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors">
            <Upload size={14}/> {uploading ? '...' : t('uploadFile')}
          </button>
        )}
        {!editingFile && (
          <button onClick={loadDir} className={`${userRole === 'admin' ? '' : 'ml-auto'} text-zinc-500 hover:text-white transition-colors text-xs`}>↻ {t('commonRefresh')}</button>
        )}
      </div>

      {/* Hidden file input for manual/premium plugin .jar/.zip upload (admin/owner only) */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".jar,.zip"
        onChange={handleUpload}
        className="hidden"
      />

      {!editingFile && userRole === 'admin' && (
        <div className="text-xs text-zinc-500 mb-3 flex items-center gap-1.5 px-1">
          <Upload size={12} className="text-green-500"/> {t('uploadHint')}
        </div>
      )}

      {uploadMsg && !editingFile && (
        <div className="bg-zinc-900 border border-zinc-700 text-zinc-200 rounded-lg p-3 mb-4 text-sm flex items-center gap-2">
          <AlertCircle size={16}/> {uploadMsg}
        </div>
      )}

      {fileNote && !editingFile && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 rounded-lg p-3 mb-4 text-sm flex items-center gap-2">
          <AlertCircle size={16}/> {fileNote}
        </div>
      )}

      {editingFile ? (
        <div className="flex-1 flex flex-col bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden relative">
          <div className="bg-zinc-900 border-b border-zinc-800 p-3 flex justify-between items-center">
            <span className="font-mono text-sm text-zinc-300">{editingFile}</span>
            <div className="flex items-center gap-3">
              {savedMsg && <span className="text-green-400 text-xs font-bold animate-pulse">{t('fileSaved')} — {t('filesRestartMayBeNeeded')}</span>}
              {fileNote && <span className="text-red-400 text-xs font-bold">{fileNote}</span>}
              {userRole === 'admin' && (
                <button onClick={handleSave} disabled={saving} className="bg-green-600 hover:bg-green-500 text-white px-4 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-50">
                  <Save size={14}/> {saving ? '...' : t('saveFile')}
                </button>
              )}
              <button onClick={() => { setEditingFile(null); setFileNote(null); }} className="text-zinc-400 hover:text-red-400 p-1 transition-colors">
                <X size={18}/>
              </button>
            </div>
          </div>
          <textarea
            value={fileContent}
            onChange={(e) => setFileContent(e.target.value)}
            readOnly={userRole !== 'admin'}
            className="flex-1 w-full bg-black text-zinc-300 font-mono text-sm p-4 outline-none resize-none leading-relaxed"
            dir="ltr"
            spellCheck="false"
          />
        </div>
      ) : (
        <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-zinc-600">{t('commonLoading')}</div>
          ) : error ? (
            <div className="p-8 text-center text-red-400 text-sm">{error}</div>
          ) : entries.length === 0 ? (
            <div className="p-8 text-center text-zinc-600">{t('filesEmptyFolder')}</div>
          ) : entries.map((entry) => {
            const isFolder = entry.type === 'dir';
            return (
              <div key={entry.name} onClick={() => openEntry(entry)}
                className="flex items-center justify-between p-4 border-b border-zinc-900/50 hover:bg-zinc-900 transition-colors group cursor-pointer"
                dir="ltr">
                <div className="flex items-center gap-3">
                  {isFolder ? <Folder size={20} className="text-blue-400 fill-blue-400/20"/> :
                   /\.(yml|yaml|properties|json|toml|conf|cfg|ini)$/i.test(entry.name) ? <FileCode size={20} className="text-orange-400"/> :
                   <FileText size={20} className="text-zinc-500"/>}
                  <span className="font-medium text-zinc-200">{entry.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  {!isFolder && <span className="text-xs text-zinc-600">{fmtSize(entry.size)}</span>}
                  {!isFolder && userRole === 'admin' && <Edit3 size={16} className="text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity"/>}
                  {!isFolder && userRole === 'admin' && (
                    <button onClick={(e) => handleDelete(entry, e)} title={t('commonDelete')}
                      className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
                      <Trash2 size={16}/>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
