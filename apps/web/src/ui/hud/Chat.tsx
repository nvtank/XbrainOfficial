import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronUp, Lock, MessageSquare, Send, Smile } from 'lucide-react';
import { CHAT_MAX_LENGTH, type ChatMsg } from '@xbrain/shared';
import { useChat, type ChatTab } from '../../stores/chat';
import { useGame } from '../../stores/game';
import { useWorld } from '../../stores/world';
import { net } from '../../services/network';

const EMOJI = ['😀', '😂', '😊', '😍', '🤔', '😎', '😅', '🙏', '👍', '👏', '🙌', '🔥', '🎉', '💯', '✅', '❌', '☕', '🍜', '💻', '📌', '🚀', '❤️', '👋', '😴'];
const TABS: Array<{ id: ChatTab; label: string }> = [
  { id: 'global', label: 'Global' },
  { id: 'nearby', label: 'Nearby' },
  { id: 'meeting', label: 'Meeting' },
  { id: 'private', label: 'Private' },
];
const CHANNEL_COLOR: Record<string, string> = {
  global: 'text-sky-300',
  nearby: 'text-emerald-300',
  meeting: 'text-violet-300',
  private: 'text-pink-300',
  system: 'text-white/40',
};

const time = (t: number) => new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

function Message({ m, selfSid }: { m: ChatMsg; selfSid: string | null }) {
  if (m.channel === 'system')
    return (
      <div className="px-1 text-[11px] italic text-white/40">
        {time(m.t)} · {m.text}
      </div>
    );
  const self = m.from === selfSid;
  return (
    <div className="group px-1 text-[13px] leading-snug">
      <span className="mr-1.5 font-mono text-[10px] text-white/35">{time(m.t)}</span>
      {m.channel === 'private' && <Lock className="mr-1 inline h-3 w-3 text-pink-300" />}
      <span className={`font-semibold ${self ? 'text-brand' : CHANNEL_COLOR[m.channel]}`}>
        {m.fromName}
        {m.channel === 'private' && m.toName ? ` → ${self ? m.toName : 'you'}` : ''}
      </span>
      <span className="text-white/40">: </span>
      <span className="break-words text-white/90">{m.text}</span>
    </div>
  );
}

export function ChatPanel() {
  const open = useGame((s) => s.chatOpen);
  const focused = useGame((s) => s.chatFocused);
  const { messages, tab, privateTo, unread } = useChat();
  const players = useWorld((s) => s.players);
  const selfSid = useWorld((s) => s.selfSid);
  const myZone = useWorld((s) => (s.selfSid ? s.players[s.selfSid]?.zone : undefined));
  const [text, setText] = useState('');
  const [emoji, setEmoji] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(
    () => messages.filter((m) => (tab === 'global' ? m.channel === 'global' || m.channel === 'system' : m.channel === tab)),
    [messages, tab],
  );
  const others = Object.values(players).filter((p) => p.sid !== selfSid);

  useEffect(() => {
    if (focused) {
      inputRef.current?.focus();
      useChat.getState().set({ unread: 0 });
    }
  }, [focused]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [visible.length, open]);
  useEffect(() => {
    if (open) useChat.getState().set({ unread: 0 });
  }, [open, tab]);

  const send = () => {
    const t = text.trim();
    if (!t) {
      inputRef.current?.blur();
      return;
    }
    if (tab === 'private') {
      if (!privateTo) return useGame.getState().toast('warn', 'Choose who to message first.');
      net.chat({ channel: 'private', text: t, to: privateTo });
    } else net.chat({ channel: tab, text: t });
    setText('');
    setEmoji(false);
  };

  if (!open)
    return (
      <button className="glass pointer-events-auto flex w-fit items-center gap-2 px-3 py-2 text-sm" onClick={() => useGame.getState().set({ chatOpen: true })}>
        <MessageSquare className="h-4 w-4" /> Chat
        {unread > 0 && <span className="rounded-full bg-brand px-1.5 text-xs font-bold text-black">{unread}</span>}
        <ChevronUp className="h-4 w-4 text-white/50" />
      </button>
    );

  return (
    <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className={`glass pointer-events-auto flex flex-col overflow-hidden ${focused ? 'bg-black/70' : ''}`}>
      <div className="flex items-center gap-1 border-b border-white/10 px-2 py-1.5">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => useChat.getState().set({ tab: t.id })} className={`rounded-lg px-2 py-1 text-xs font-semibold transition ${tab === t.id ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'}`}>
            {t.label}
          </button>
        ))}
        <button className="ml-auto rounded-lg p-1 text-white/50 hover:bg-white/10 hover:text-white" onClick={() => useGame.getState().set({ chatOpen: false, chatFocused: false })} title="Collapse chat">
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
      {tab === 'private' && (
        <div className="border-b border-white/10 px-2 py-1.5">
          <select className="input py-1 text-xs" value={privateTo ?? ''} onChange={(e) => useChat.getState().set({ privateTo: e.target.value || null })}>
            <option value="">— Choose a person —</option>
            {others.map((p) => (
              <option key={p.sid} value={p.sid}>
                {p.name} #{p.userId.slice(-4)}
              </option>
            ))}
          </select>
        </div>
      )}
      {tab === 'meeting' && myZone !== 'meeting' && <div className="border-b border-white/10 px-3 py-1 text-[11px] text-amber-300/80">Meeting chat reaches people inside the Meeting Room — go there to send.</div>}
      {tab === 'nearby' && <div className="border-b border-white/10 px-3 py-1 text-[11px] text-white/40">Only people within ~10 m receive nearby messages (speech bubble above your head).</div>}
      <div ref={listRef} className="scrollbar-thin h-[170px] space-y-0.5 overflow-y-auto px-2 py-2">
        {visible.length === 0 && <div className="py-6 text-center text-xs text-white/30">No messages yet</div>}
        {visible.map((m) => (
          <Message key={m.id} m={m} selfSid={selfSid} />
        ))}
      </div>
      <div className="relative flex items-center gap-1.5 border-t border-white/10 p-2">
        <AnimatePresence>
          {emoji && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="glass absolute bottom-12 left-2 grid grid-cols-8 gap-1 p-2">
              {EMOJI.map((e) => (
                <button key={e} className="rounded-md p-1 text-lg hover:bg-white/15" onClick={() => (setText((t) => (t + e).slice(0, CHAT_MAX_LENGTH)), inputRef.current?.focus())}>
                  {e}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        <button className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white" onClick={() => setEmoji((v) => !v)}>
          <Smile className="h-4 w-4" />
        </button>
        <input
          ref={inputRef}
          className="input py-1.5"
          placeholder={`Message ${TABS.find((t) => t.id === tab)?.label.toLowerCase()}… (Enter)`}
          value={text}
          maxLength={CHAT_MAX_LENGTH}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => useGame.getState().set({ chatFocused: true })}
          onBlur={() => useGame.getState().set({ chatFocused: false })}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') send();
            if (e.key === 'Escape') (e.target as HTMLInputElement).blur();
          }}
        />
        <button className="btn-primary px-2.5 py-1.5" onClick={send} title="Send">
          <Send className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
}
