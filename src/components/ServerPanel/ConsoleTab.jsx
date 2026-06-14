import React, { useState, useEffect, useRef } from 'react';
import { Terminal, AlertCircle } from 'lucide-react';
import { sendMcCommand, getServerLogFn } from '../../lib/api';

export default function ConsoleTab({ server, t, userRole }) {
  const [logs, setLogs] = useState([]);
  const [consoleInput, setConsoleInput] = useState('');
  const [sending, setSending] = useState(false);
  const logsEndRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const fetchLogs = async () => {
      try {
        const result = await getServerLogFn({ serverId: server.id, lines: 200 });
        const data = result.data || result;
        if (!cancelled && data.success && Array.isArray(data.log)) {
          setLogs(data.log);
        }
      } catch(e) {
        if (!cancelled) setLogs([`[ERROR]: לא ניתן לטעון לוג: ${e.message}`]);
      }
    };
    fetchLogs();
    const interval = setInterval(fetchLogs, 10000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [server.id]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleSend = async () => {
    const cmd = consoleInput.trim();
    if (!cmd || sending) return;
    setConsoleInput('');
    setLogs(prev => [...prev, `> ${cmd}`]);
    setSending(true);
    try {
      const result = await sendMcCommand({ serverId: server.id, command: cmd });
      const data = result.data || result;
      if (data.success) {
        setLogs(prev => [...prev, `[RCON]: ${data.output || '✓ הפקודה בוצעה'}`]);
      } else {
        setLogs(prev => [...prev, `[ERROR]: ${data.error || 'Command failed'}`]);
      }
    } catch (e) {
      setLogs(prev => [...prev, `[ERROR]: ${e.message}`]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSend();
  };

  return (
    <div className="h-full flex flex-col animate-in fade-in">
      <div className="bg-zinc-950 border border-zinc-800 rounded-t-xl p-3 flex justify-between items-center">
        <h3 className="font-bold flex items-center gap-2"><Terminal size={18} className="text-zinc-400" /> {t('console')}</h3>
        {server.status !== 'online' && <span className="text-xs text-yellow-400 flex items-center gap-1"><AlertCircle size={14}/> סטטוס לא ידוע — נסה לשלוח פקודה</span>}
      </div>
      <div className="flex-1 bg-black border-x border-zinc-800 p-4 font-mono text-sm overflow-y-auto text-zinc-300 min-h-[300px]" dir="ltr">
        {logs.map((log, i) => (
          <div key={i} className="mb-1">
            {log.includes('[INFO]') ? <span className="text-blue-400">INFO </span> : null}
            {log.includes('[ERROR]') ? <span className="text-red-400">ERROR </span> : null}
            {log.includes('[RCON]') ? <span className="text-green-400">RCON </span> : null}
            <span dangerouslySetInnerHTML={{__html: log.replace(/\[INFO\]:\s*|\[ERROR\]:\s*|\[RCON\]:\s*/, '')}}></span>
          </div>
        ))}
        <div ref={logsEndRef} />
      </div>
      <div className="border border-zinc-800 rounded-b-xl overflow-hidden flex">
        <input
          type="text"
          placeholder={userRole === 'admin' ? 'הכנס פקודה...' : 'אין הרשאה'}
          disabled={userRole !== 'admin' || sending}
          value={consoleInput}
          onChange={e => setConsoleInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-zinc-950 px-4 py-3 outline-none text-white disabled:opacity-50 font-mono"
          dir="ltr"
        />
        <button
          onClick={handleSend}
          disabled={userRole !== 'admin' || sending || !consoleInput.trim()}
          className="bg-zinc-800 hover:bg-zinc-700 px-6 font-bold transition-colors disabled:opacity-50"
        >
          {sending ? '...' : 'Send'}
        </button>
      </div>
    </div>
  );
}
