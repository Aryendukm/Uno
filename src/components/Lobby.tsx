import React, { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import { Users, Play, Loader2, Copy, Check, QrCode } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';

const Lobby: React.FC = () => {
  const { createGame, joinGame, roomId, gameState, startGame, myPlayerId, isHost, error } = useGame();
  const [name, setName] = useState('');
  const [joinId, setJoinId] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) setJoinId(roomParam);
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setIsCreating(true);
    await createGame(name);
    setIsCreating(false);
  };

  const handleJoin = async () => {
    if (!name.trim() || !joinId.trim()) return;
    setIsJoining(true);
    try { await joinGame(joinId, name); } catch (e) { console.error(e); }
    setIsJoining(false);
  };

  const copyRoomId = () => {
    if (roomId) {
      navigator.clipboard.writeText(`${window.location.origin}?room=${roomId}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  /* ── In-Lobby Room View ─────────────────────────────────────────── */
  if (roomId && gameState) {
    return (
      <div className="casino-felt flex flex-col items-center justify-center min-h-screen p-4">
        {/* Ambient corner ornaments */}
        <div className="pointer-events-none fixed top-0 left-0 w-40 h-40 opacity-20"
             style={{ background: 'radial-gradient(circle at 0 0, #c9a84c, transparent 70%)' }} />
        <div className="pointer-events-none fixed bottom-0 right-0 w-40 h-40 opacity-20"
             style={{ background: 'radial-gradient(circle at 100% 100%, #c9a84c, transparent 70%)' }} />

        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          className="casino-panel w-full max-w-md rounded-2xl p-8"
        >
          {/* Header */}
          <div className="text-center mb-8">
            <h2 className="font-display text-4xl font-bold text-gold tracking-widest mb-1">LOBBY</h2>
            <div className="h-px bg-gradient-to-r from-transparent via-gold to-transparent opacity-50 mx-8" />
          </div>

          {/* Room Link */}
          <div className="mb-8 p-4 rounded-xl border border-gold/20 bg-black/30">
            <p className="text-xs text-gold/60 uppercase tracking-widest mb-3 font-display">Share to Join</p>
            <div className="flex items-center gap-2 mb-3">
              <code className="flex-1 bg-black/50 px-3 py-2 rounded-lg font-mono text-gold/80 truncate text-xs border border-gold/20">
                {window.location.origin}?room={roomId}
              </code>
              <button onClick={copyRoomId}
                className="p-2 rounded-lg border border-gold/30 bg-black/40 text-gold/70 hover:text-gold hover:border-gold transition-all"
                title="Copy">
                {copied ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
              </button>
              <button onClick={() => setShowQr(!showQr)}
                className={`p-2 rounded-lg border transition-all ${showQr ? 'border-gold bg-gold/20 text-gold' : 'border-gold/30 bg-black/40 text-gold/70 hover:text-gold hover:border-gold'}`}
                title="QR Code">
                <QrCode size={18} />
              </button>
            </div>

            <AnimatePresence>
              {showQr && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden flex justify-center pb-2"
                >
                  <div className="p-4 bg-white rounded-xl shadow-lg">
                    <QRCodeSVG value={`${window.location.origin}?room=${roomId}`} size={148} />
                    <p className="text-slate-800 text-center text-xs mt-2 font-bold font-display tracking-wider">SCAN TO JOIN</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Players list */}
          <div className="mb-8 space-y-3">
            <h3 className="font-display text-sm text-gold/70 uppercase tracking-widest flex items-center gap-2">
              <Users size={16} />Players ({gameState.players.length})
            </h3>
            {gameState.players.map(p => (
              <div key={p.id}
                className="flex items-center justify-between px-4 py-3 rounded-xl border border-gold/10 bg-black/20">
                <span className={`font-medium text-sm ${p.id === myPlayerId ? 'text-gold' : 'text-stone-300'}`}>
                  {p.name} {p.id === myPlayerId && <span className="text-xs text-gold/60">(You)</span>}
                </span>
                {p.isHost && (
                  <span className="text-xs font-display tracking-wider px-3 py-1 rounded-full border border-gold/50 text-gold bg-gold/10">
                    HOST
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Start Button */}
          {isHost ? (
            <button
              onClick={startGame}
              disabled={gameState.players.length < 2}
              className="btn-gold w-full py-4 rounded-xl font-display tracking-widest text-sm flex items-center justify-center gap-3 disabled:opacity-30 disabled:cursor-not-allowed disabled:transform-none"
            >
              <Play size={20} fill="currentColor" /> DEAL CARDS
            </button>
          ) : (
            <div className="text-center py-4 text-gold/50 font-display text-sm tracking-widest animate-pulse-glow">
              WAITING FOR HOST...
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  /* ── Landing / Entry View ───────────────────────────────────────── */
  return (
    <div className="casino-felt flex flex-col items-center justify-center min-h-screen p-6 overflow-hidden">
      {/* Gold corner accents */}
      <div className="pointer-events-none fixed top-0 left-0 w-64 h-64 opacity-10"
           style={{ background: 'radial-gradient(circle at 0 0, #c9a84c, transparent 60%)' }} />
      <div className="pointer-events-none fixed top-0 right-0 w-64 h-64 opacity-10"
           style={{ background: 'radial-gradient(circle at 100% 0, #c9a84c, transparent 60%)' }} />
      <div className="pointer-events-none fixed bottom-0 left-0 w-64 h-64 opacity-10"
           style={{ background: 'radial-gradient(circle at 0 100%, #c9a84c, transparent 60%)' }} />
      <div className="pointer-events-none fixed bottom-0 right-0 w-64 h-64 opacity-10"
           style={{ background: 'radial-gradient(circle at 100% 100%, #c9a84c, transparent 60%)' }} />

      {/* Title */}
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-16"
      >
        <p className="font-display text-gold/50 tracking-[0.4em] text-xs mb-3 uppercase">The Classic Card Game</p>
        <h1 className="font-display font-black tracking-widest text-7xl text-gold leading-none drop-shadow-2xl"
            style={{ textShadow: '0 0 40px rgba(201,168,76,0.5), 0 4px 0 rgba(0,0,0,0.8)' }}>
          UNO
        </h1>
        <div className="mt-3 h-px bg-gradient-to-r from-transparent via-gold to-transparent opacity-40 max-w-xs mx-auto" />
        <p className="font-display text-gold/40 tracking-[0.3em] text-xs mt-3 uppercase">Online Edition</p>
      </motion.div>

      {/* Cards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="grid md:grid-cols-2 gap-6 w-full max-w-3xl"
      >
        {/* Create Game */}
        <div className="casino-panel rounded-2xl p-8 flex flex-col">
          <div className="mb-6">
            <div className="w-12 h-12 rounded-xl border border-gold/40 bg-gold/10 flex items-center justify-center text-gold mb-4">
              <Play size={24} fill="currentColor" />
            </div>
            <h2 className="font-display text-xl font-bold text-gold tracking-wider mb-1">Create Room</h2>
            <p className="text-stone-400 text-sm">Host a private table and invite friends.</p>
          </div>
          <div className="h-px bg-gradient-to-r from-gold/20 to-transparent mb-6" />
          <input
            type="text"
            placeholder="Your Name"
            className="input-casino w-full mb-5 px-5 py-3 rounded-xl text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <button
            onClick={handleCreate}
            disabled={isCreating || !name.trim()}
            className="btn-gold mt-auto w-full py-3 rounded-xl font-display tracking-widest text-sm flex justify-center items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {isCreating ? <Loader2 size={18} className="animate-spin" /> : <><Play size={16} fill="currentColor" /> OPEN TABLE</>}
          </button>
        </div>

        {/* Join Game */}
        <div className="casino-panel rounded-2xl p-8 flex flex-col">
          <div className="mb-6">
            <div className="w-12 h-12 rounded-xl border border-gold/40 bg-gold/10 flex items-center justify-center text-gold mb-4">
              <Users size={24} />
            </div>
            <h2 className="font-display text-xl font-bold text-gold tracking-wider mb-1">Join Table</h2>
            <p className="text-stone-400 text-sm">Enter a Room ID to sit at a friend's table.</p>
          </div>
          <div className="h-px bg-gradient-to-r from-gold/20 to-transparent mb-6" />
          <input
            type="text"
            placeholder="Your Name"
            className="input-casino w-full mb-3 px-5 py-3 rounded-xl text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            type="text"
            placeholder="Room ID"
            className="input-casino w-full mb-5 px-5 py-3 rounded-xl font-mono text-sm"
            value={joinId}
            onChange={(e) => setJoinId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
          />
          <button
            onClick={handleJoin}
            disabled={isJoining || !name.trim() || !joinId.trim()}
            className="btn-gold mt-auto w-full py-3 rounded-xl font-display tracking-widest text-sm flex justify-center items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {isJoining ? <Loader2 size={18} className="animate-spin" /> : <><Users size={16} /> TAKE A SEAT</>}
          </button>
        </div>
      </motion.div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mt-8 px-6 py-4 rounded-xl border border-red-700/60 bg-red-950/60 text-red-300 text-sm text-center max-w-sm"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Lobby;
