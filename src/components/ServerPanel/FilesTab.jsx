import React, { useState, useEffect } from 'react';
import {
  HardDrive, FileCode, AlertCircle, Save, X, Folder, FileText, Edit3, Trash2
} from 'lucide-react';
import { listFilesFn, readFileFn, writeFileFn, deleteFileFn } from '../../lib/api';

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

  const pathStr = currentPath.join('/');

  const loadDir = async () => {
    setLoading(true); setError(null); setFileNote(null);
    try {
      const res = await listFilesFn({ serverId: server.id, path: pathStr });
      const d = res.data || res;
      if (d.success) setEntries(d.entries || []);
      else setError(d.error || 'שגיאה בטעינת קבצים');
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
      if (!d.success) { setFileNote(d.error || 'שגיאה בקריאת הקובץ'); return; }
      if (d.binary) { setFileNote(d.tooLarge ? 'הקובץ גדול מדי לתצוגה' : 'קובץ בינארי — לא ניתן לעריכה'); return; }
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
      else setFileNote(d.error || 'שמירה נכשלה');
    } catch (e) { setFileNote(e.message); }
    setSaving(false);
  };

  const handleDelete = async (entry, e) => {
    e.stopPropagation();
    if (userRole !== 'admin') return;
    if (!window.confirm(`למחוק את "${entry.name}"? פעולה בלתי הפיכה.`)) return;
    setFileNote(null);
    try {
      const res = await deleteFileFn({ serverId: server.id, path: [...currentPath, entry.name].join('/') });
      const d = res.data || res;
      if (d.success) loadDir();
      else setFileNote(d.error || 'מחיקה נכשלה');
    } catch (err) { setFileNote(err.message); }
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
        {!editingFile && (
          <button onClick={loadDir} className="ml-auto text-zinc-500 hover:text-white transition-colors text-xs">↻ רענן</button>
        )}
      </div>

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
              {savedMsg && <span className="text-green-400 text-xs font-bold animate-pulse">{t('fileSaved')} — ייתכן שצריך הפעלה מחדש</span>}
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
            <div className="p-8 text-center text-zinc-600">טוען...</div>
          ) : error ? (
            <div className="p-8 text-center text-red-400 text-sm">{error}</div>
          ) : entries.length === 0 ? (
            <div className="p-8 text-center text-zinc-600">תיקייה ריקה</div>
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
                    <button onClick={(e) => handleDelete(entry, e)} title="מחק"
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
