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

  // Auto-fill Room ID from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
        setJoinId(roomParam);
    }
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
    try {
        await joinGame(joinId, name);
    } catch (e) {
        console.error(e);
    }
    setIsJoining(false);
  };

  const copyRoomId = () => {
    if (roomId) {
        // Copy the join URL if possible, otherwise just the ID
        const url = `${window.location.origin}?room=${roomId}`;
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }
  };

  if (roomId && gameState) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white p-4">
        <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-slate-800 rounded-2xl p-8 shadow-2xl border border-slate-700"
        >
            <h2 className="text-3xl font-bold mb-6 text-center bg-gradient-to-r from-pink-500 to-violet-500 bg-clip-text text-transparent">Lobby</h2>
            
            <div className="mb-8 p-4 bg-slate-900/50 rounded-xl border border-slate-700">
                <p className="text-sm text-slate-400 mb-2">Share Link to Join:</p>
                <div className="flex items-center gap-2 mb-4">
                    <code className="flex-1 bg-black/30 p-3 rounded-lg font-mono text-green-400 truncate text-xs">
                        {window.location.origin}?room={roomId}
                    </code>
                    <button onClick={copyRoomId} className="p-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors" title="Copy Link">
                        {copied ? <Check size={20} className="text-green-500" /> : <Copy size={20} />}
                    </button>
                    <button 
                        onClick={() => setShowQr(!showQr)} 
                        className={`p-3 rounded-lg transition-colors ${showQr ? 'bg-indigo-600 text-white' : 'bg-slate-700 hover:bg-slate-600'}`}
                        title="Show QR Code"
                    >
                        <QrCode size={20} />
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
                            <div className="p-4 bg-white rounded-xl">
                                <QRCodeSVG value={`${window.location.origin}?room=${roomId}`} size={160} />
                                <p className="text-slate-900 text-center text-xs mt-2 font-bold">Scan to Join</p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <div className="space-y-4 mb-8">
                <h3 className="text-xl font-semibold flex items-center gap-2">
                    <Users size={24} className="text-indigo-400" /> 
                    Players ({gameState.players.length})
                </h3>
                <div className="space-y-2">
                    {gameState.players.map(p => (
                        <div key={p.id} className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                            <span className="font-medium">{p.name} {p.id === myPlayerId && '(You)'}</span>
                            {p.isHost && <span className="text-xs bg-indigo-500 px-2 py-1 rounded text-white">HOST</span>}
                        </div>
                    ))}
                </div>
            </div>

            {isHost ? (
                <button 
                    onClick={startGame}
                    disabled={gameState.players.length < 2}
                    className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all
                        ${gameState.players.length < 2 
                            ? 'bg-slate-700 text-slate-500 cursor-not-allowed' 
                            : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:scale-105 shadow-lg shadow-green-900/50'
                        }`}
                >
                    <Play size={24} /> Start Game
                </button>
            ) : (
                <div className="text-center p-4 bg-slate-700/30 rounded-xl animate-pulse">
                    Waiting for host to start...
                </div>
            )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-4">
       <div className="text-center mb-12">
            <h1 className="text-6xl font-black text-slate-900 mb-4 tracking-tighter">
                UNO <span className="text-indigo-600">ONLINE</span>
            </h1>
            <p className="text-xl text-slate-500">Play with friends over the internet! No signup required.</p>
       </div>

       <div className="grid md:grid-cols-2 gap-8 w-full max-w-4xl">
            {/* Create Game */}
            <motion.div 
                whileHover={{ y: -5 }}
                className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 flex flex-col items-center text-center"
            >
                <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mb-6 text-indigo-600">
                    <Play size={32} />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Create New Game</h2>
                <p className="text-slate-500 mb-6">Start a room and invite your friends via ID.</p>
                
                <input 
                    type="text" 
                    placeholder="Your Name" 
                    className="w-full mb-4 px-6 py-3 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />
                
                <button 
                    onClick={handleCreate}
                    disabled={isCreating || !name}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center"
                >
                    {isCreating ? <Loader2 className="animate-spin" /> : 'Create Room'}
                </button>
            </motion.div>

            {/* Join Game */}
            <motion.div 
                whileHover={{ y: -5 }}
                className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 flex flex-col items-center text-center"
            >
                <div className="w-16 h-16 bg-pink-100 rounded-2xl flex items-center justify-center mb-6 text-pink-600">
                    <Users size={32} />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Join Game</h2>
                <p className="text-slate-500 mb-6">Enter a Room ID to join your friends.</p>

                <input 
                    type="text" 
                    placeholder="Your Name" 
                    className="w-full mb-3 px-6 py-3 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-pink-500"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />
                
                <input 
                    type="text" 
                    placeholder="Room ID" 
                    className="w-full mb-4 px-6 py-3 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-pink-500"
                    value={joinId}
                    onChange={(e) => setJoinId(e.target.value)}
                />

                <button 
                    onClick={handleJoin}
                    disabled={isJoining || !name || !joinId}
                    className="w-full py-3 bg-pink-600 hover:bg-pink-700 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center"
                >
                    {isJoining ? <Loader2 className="animate-spin" /> : 'Join Room'}
                </button>
            </motion.div>
       </div>
       
       {error && (
           <div className="mt-8 p-4 bg-red-100 text-red-700 rounded-xl max-w-md text-center">
               {error}
           </div>
       )}
    </div>
  );
};

export default Lobby;
