import React, { useState } from 'react';
import { useGame } from '../context/GameContext';
import CardComponent from './Card';
import Chat from './Chat';
import { Card, Color } from '../utils/gameLogic';
import { motion, AnimatePresence } from 'framer-motion';
import { User, ArrowRight, Play, Zap, ArrowLeftRight, Users } from 'lucide-react';

const GameTable: React.FC = () => {
  const { 
    gameState, myPlayerId, playCards, drawCard, playDrawnCard, 
    isHost, startGame, applyRule 
  } = useGame();

  const [wildCardIds, setWildCardIds] = useState<string[] | null>(null);
  const [blankWildCardId, setBlankWildCardId] = useState<string | null>(null);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());

  // Rule 4: Shuffle Hand state
  const [shuffleCardId, setShuffleCardId] = useState<string | null>(null);
  const [shuffleAction, setShuffleAction] = useState<'swap_with' | 'swap_two' | null>(null);
  const [shuffleTargetIds, setShuffleTargetIds] = useState<string[]>([]);

  // Rule 3: Draw-and-play wild color state
  const [drawnWildPlayCardId, setDrawnWildPlayCardId] = useState<string | null>(null);

  if (!gameState) return null;

  const { 
    players, currentPlayerIndex, discardPile, direction, currentColor, 
    winner, status, lastAction, unoCalledBy, pendingWild4Stack, drawnCardId 
  } = gameState;
  
  const me = players.find(p => p.id === myPlayerId);
  const isMyTurn = players[currentPlayerIndex].id === myPlayerId;
  const topCard = discardPile[discardPile.length - 1];

  // ─── Play Handlers ─────────────────────────────────────────────────────────

  const handleCardClick = (card: Card) => {
    if (!isMyTurn) return;
    if (drawnCardId) return; // Must resolve draw-and-play first
    
    // If stacking +4, we can only select wild4 cards
    if (pendingWild4Stack > 0) {
      if (card.value !== 'wild4') return;
      const newSelected = new Set(selectedCardIds);
      if (newSelected.has(card.id)) newSelected.delete(card.id);
      else newSelected.add(card.id);
      setSelectedCardIds(newSelected);
      return;
    }

    // Normal multi-selection logic
    const newSelected = new Set(selectedCardIds);
    if (newSelected.has(card.id)) {
      newSelected.delete(card.id);
    } else {
      if (newSelected.size > 0 && me?.hand) {
        const firstSelectedCard = me.hand.find(c => newSelected.has(c.id));
        if (firstSelectedCard && firstSelectedCard.value !== card.value) {
          // Cannot mix different numbers/values
          return;
        }
      }
      newSelected.add(card.id);
    }
    setSelectedCardIds(newSelected);
  };

  const handlePlaySelected = () => {
    if (selectedCardIds.size === 0 || !me) return;
    
    const cardsToPlay = me.hand.filter(c => selectedCardIds.has(c.id));
    if (cardsToPlay.length === 0) return;

    const firstCard = cardsToPlay[0];
    
    // Handle Special Modal Requirements
    if (firstCard.value === 'wild' || firstCard.value === 'wild4') {
      setWildCardIds(Array.from(selectedCardIds));
      setSelectedCardIds(new Set());
      return;
    }

    if (firstCard.value === 'blank_wild') {
      setBlankWildCardId(firstCard.id);
      setSelectedCardIds(new Set());
      return;
    }

    if (firstCard.value === 'shuffle') {
      setShuffleCardId(firstCard.id);
      setShuffleAction(null);
      setShuffleTargetIds([]);
      setSelectedCardIds(new Set());
      return;
    }

    // Normal play
    playCards(Array.from(selectedCardIds));
    setSelectedCardIds(new Set());
  };

  const handleColorSelect = (color: Color) => {
    if (wildCardIds) {
      playCards(wildCardIds, color);
      setWildCardIds(null);
    } else if (drawnWildPlayCardId) {
      playDrawnCard(true, color);
      setDrawnWildPlayCardId(null);
    }
  };

  const handleRuleSelect = (rule: string) => {
    if (blankWildCardId) {
      playCards([blankWildCardId]);
      applyRule(rule);
      setBlankWildCardId(null);
    }
  };

  // ─── Rule 3: Draw and Play Handlers ────────────────────────────────────────

  const handleDrawAndPlayDecision = (play: boolean) => {
    if (!play) {
      playDrawnCard(false);
      return;
    }

    // Wants to play it
    const drawnCard = me?.hand.find(c => c.id === drawnCardId);
    if (!drawnCard) return;

    if (drawnCard.color === 'black') {
      // Need color picker first
      setDrawnWildPlayCardId(drawnCard.id);
    } else {
      playDrawnCard(true);
    }
  };

  // ─── Rule 4: Shuffle Hand Handlers ─────────────────────────────────────────

  const handleShuffleTargetSelect = (playerId: string) => {
    if (shuffleTargetIds.includes(playerId)) {
      setShuffleTargetIds(shuffleTargetIds.filter(id => id !== playerId));
    } else {
      if (shuffleAction === 'swap_with' && shuffleTargetIds.length === 1) return;
      if (shuffleAction === 'swap_two' && shuffleTargetIds.length === 2) return;
      setShuffleTargetIds([...shuffleTargetIds, playerId]);
    }
  };

  const confirmShuffle = () => {
    if (!shuffleCardId || !shuffleAction) return;
    if (shuffleAction === 'swap_with' && shuffleTargetIds.length === 1) {
      playCards([shuffleCardId], undefined, shuffleAction, shuffleTargetIds);
    } else if (shuffleAction === 'swap_two' && shuffleTargetIds.length === 2) {
      playCards([shuffleCardId], undefined, shuffleAction, shuffleTargetIds);
    } else {
      return; // Not enough targets
    }
    
    // Reset state
    setShuffleCardId(null);
    setShuffleAction(null);
    setShuffleTargetIds([]);
  };

  // ─── Render Helpers ────────────────────────────────────────────────────────

  if (status === 'ended' && winner) {
      return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
              <motion.div 
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-gradient-to-br from-yellow-50 to-orange-50 p-12 rounded-3xl text-center shadow-2xl max-w-lg w-full"
              >
                  <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500 mb-4">
                      {winner === me?.name ? '🎉 VICTORY! 🎉' : 'GAME OVER'}
                  </h1>
                  <p className="text-2xl text-slate-600 mb-8">
                      <span className="font-bold text-slate-900">{winner}</span> won the game!
                  </p>
                  
                  {isHost && (
                      <button onClick={startGame} className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-bold hover:shadow-lg transition-all shadow-lg">
                          Play Again
                      </button>
                  )}
              </motion.div>
          </div>
      );
  }

  const drawnCardToPlay = drawnCardId ? me?.hand.find(c => c.id === drawnCardId) : null;

  return (
    <div className="relative w-full h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-hidden flex flex-col">
      {/* Background Texture */}
      <div className="absolute inset-0 opacity-5 pointer-events-none" 
           style={{ backgroundImage: `radial-gradient(circle at 2px 2px, white 1px, transparent 0)`, backgroundSize: '40px 40px' }} 
      />

      {/* Circular Table */}
      <div className="flex-1 relative flex items-center justify-center">
        <div className="relative w-full h-full flex items-center justify-center">
          {/* Table Circle Background */}
          <div className="absolute w-3/4 aspect-square rounded-full bg-gradient-to-br from-green-900/30 to-emerald-900/20 border-4 border-green-700/40 shadow-2xl" />

          {/* Players */}
          {players.map((player, idx) => {
            const totalPlayers = players.length;
            const angle = (idx / totalPlayers) * 360 - 90;
            const radius = 38;
            const x = 50 + radius * Math.cos((angle * Math.PI) / 180);
            const y = 50 + radius * Math.sin((angle * Math.PI) / 180);
            const isCurrent = players[currentPlayerIndex].id === player.id;
            const isMe = player.id === myPlayerId;
            const hasCalledUno = unoCalledBy && unoCalledBy[player.id];

            return (
              <motion.div
                key={player.id}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                style={{
                  position: 'absolute',
                  left: `${x}%`,
                  top: `${y}%`,
                  transform: 'translate(-50%, -50%)'
                }}
                className="flex flex-col items-center gap-3"
              >
                {/* Player Avatar */}
                <motion.div
                  animate={{ scale: isCurrent ? 1.2 : 1 }}
                  className={`relative w-24 h-24 rounded-full flex items-center justify-center border-4 transition-all
                    ${isCurrent ? 'bg-yellow-500/40 border-yellow-400 shadow-2xl shadow-yellow-500/70' : 'bg-slate-600/50 border-slate-500 shadow-lg'}`}
                >
                  <User size={48} className={`${isCurrent ? 'text-yellow-300' : 'text-slate-300'}`} />
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 0.5, repeat: Infinity }}
                    className={`absolute -bottom-2 -right-2 px-3 py-1 rounded-full text-xs font-bold text-white
                      ${isCurrent ? 'bg-yellow-500' : 'bg-slate-700'}`}
                  >
                    {player.hand.length}
                  </motion.div>
                </motion.div>

                {/* Player Name */}
                <div className="text-center">
                  <span className={`font-bold text-sm truncate max-w-[120px] ${isMe ? 'text-green-400' : 'text-white'}`}>
                    {isMe ? `You` : player.name}
                  </span>
                  {hasCalledUno && (
                    <motion.div
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ duration: 0.5, repeat: Infinity }}
                      className="text-xs text-red-400 font-bold"
                    >
                      🎺 UNO!
                    </motion.div>
                  )}
                </div>
              </motion.div>
            );
          })}

          {/* Center - Deck and Discard Pile */}
          <div className="absolute flex items-center justify-center gap-16 z-20">
            {/* Deck */}
            <motion.div
              whileHover={isMyTurn && !drawnCardId ? { scale: 1.08 } : undefined}
              className={`relative group ${isMyTurn && !drawnCardId ? 'cursor-pointer' : 'cursor-not-allowed opacity-80'}`}
              onClick={(isMyTurn && !drawnCardId) ? drawCard : undefined}
            >
              <div className="w-20 h-28 md:w-24 md:h-32 bg-gradient-to-br from-blue-700 to-blue-900 rounded-xl border-4 border-white shadow-2xl flex items-center justify-center relative transition-all">
                <div className="w-16 h-24 md:w-20 md:h-28 border-2 border-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-lg md:text-2xl font-black text-blue-400">UNO</span>
                </div>
              </div>
              <div className="absolute top-1 left-1 w-full h-full bg-blue-800 rounded-xl border border-blue-700 -z-10" />
              <div className="absolute top-2 left-2 w-full h-full bg-blue-900 rounded-xl border border-blue-800 -z-20" />
              
              {isMyTurn && !drawnCardId && pendingWild4Stack === 0 && (
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-blue-300 font-bold text-xs bg-black/70 px-3 py-1 rounded-full"
                >
                  Draw Card
                </motion.div>
              )}
              {isMyTurn && !drawnCardId && pendingWild4Stack > 0 && (
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-red-400 font-bold text-xs bg-black/90 px-3 py-1 rounded-full border border-red-500"
                >
                  Draw {pendingWild4Stack} Penalty!
                </motion.div>
              )}
            </motion.div>

            {/* Discard Pile */}
            <motion.div
              className="relative"
              animate={{ rotateZ: direction === -1 ? 180 : 0 }}
              transition={{ duration: 0.5 }}
            >
              {topCard && (
                <motion.div
                  key={topCard.id}
                  initial={{ scale: 0, rotateZ: -180 }}
                  animate={{ scale: 1, rotateZ: 0 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                >
                  <CardComponent card={topCard} disabled />
                </motion.div>
              )}
              {/* Current Color Indicator */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                className={`absolute -inset-6 rounded-3xl border-4 opacity-50 pointer-events-none
                  ${currentColor === 'red' ? 'border-red-500' : 
                    currentColor === 'blue' ? 'border-blue-500' :
                    currentColor === 'green' ? 'border-green-500' :
                    'border-yellow-400'}`}
              />
            </motion.div>
          </div>
        </div>
      </div>

      {/* Action Log */}
      <AnimatePresence>
        {lastAction && (
          <motion.div
            key={lastAction}
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-8 left-1/2 -translate-x-1/2 bg-gradient-to-r from-slate-800/95 to-slate-900/95 backdrop-blur-md px-6 py-3 rounded-full text-white font-medium z-50 shadow-2xl border border-slate-700 max-w-lg text-center text-sm"
          >
            {lastAction}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rule 5 +4 Stack Warning Indicator */}
      <AnimatePresence>
        {pendingWild4Stack > 0 && isMyTurn && !drawnCardId && (
          <motion.div
             initial={{ opacity: 0, scale: 0.5 }}
             animate={{ opacity: 1, scale: 1 }}
             exit={{ opacity: 0, scale: 0.5 }}
             className="absolute top-1/4 left-1/2 -translate-x-1/2 bg-red-600/90 text-white px-8 py-4 rounded-2xl border-4 border-red-400 shadow-2xl z-40 text-center backdrop-blur-sm"
          >
             <h2 className="text-2xl font-black mb-2">🔥 +{pendingWild4Stack} INCOMING! 🔥</h2>
             <p className="text-sm font-bold">Play a +4 to stack, or click Deck to Draw.</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rule 3: Draw-and-Play Modal */}
      <AnimatePresence>
        {isMyTurn && drawnCardId && !drawnWildPlayCardId && drawnCardToPlay && (
          <motion.div
             initial={{ opacity: 0, y: 50 }}
             animate={{ opacity: 1, y: 0 }}
             exit={{ opacity: 0, y: 50 }}
             className="absolute bottom-[280px] left-1/2 -translate-x-1/2 bg-slate-800/95 border border-slate-600 text-white px-8 py-6 rounded-3xl shadow-2xl z-50 text-center backdrop-blur-md flex flex-col items-center gap-4 min-w-[300px]"
          >
             <h3 className="text-xl font-bold text-yellow-300">You drew a card!</h3>
             <div className="transform scale-75 origin-top">
                <CardComponent card={drawnCardToPlay} disabled />
             </div>
             <div className="flex gap-4 w-full">
                <button 
                  onClick={() => handleDrawAndPlayDecision(true)}
                  className="flex-1 bg-green-500 hover:bg-green-600 py-3 rounded-xl font-bold transition-colors"
                >
                  Play It
                </button>
                <button 
                  onClick={() => handleDrawAndPlayDecision(false)}
                  className="flex-1 bg-slate-600 hover:bg-slate-500 py-3 rounded-xl font-bold transition-colors"
                >
                  Keep & Pass
                </button>
             </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* My Hand - Bottom */}
      <div className="relative z-10 w-full min-h-[220px] bg-gradient-to-t from-black/95 via-black/70 to-transparent flex flex-col justify-end pb-8 pt-20 overflow-visible">
        <div className="absolute top-8 left-0 right-0 text-center">
          {isMyTurn ? (
            <motion.span
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 0.6, repeat: Infinity }}
              className="text-3xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-orange-300 to-red-400 drop-shadow-lg"
            >
              🎮 YOUR TURN 🎮
            </motion.span>
          ) : (
            <span className="text-lg font-medium text-slate-300">
              Waiting for <span className="font-bold text-cyan-300">{players[currentPlayerIndex].name}</span>...
            </span>
          )}
        </div>

        {/* Cards */}
        <div className="flex justify-center items-end -space-x-6 md:-space-x-10 px-4 overflow-x-auto pb-6 pt-10 min-h-[180px] scrollbar-hide">
          {me?.hand.map((card, i) => {
            const isDrawnCard = card.id === drawnCardId;
            const disabled = !isMyTurn || (drawnCardId && !isDrawnCard) || (pendingWild4Stack > 0 && card.value !== 'wild4');
            const selected = selectedCardIds.has(card.id);

            return (
              <motion.div
                key={card.id}
                initial={{ y: 100, opacity: 0, rotateZ: -20 }}
                animate={{ y: 0, opacity: 1, rotateZ: 0 }}
                transition={{ delay: i * 0.05, type: 'spring' }}
                className={`origin-bottom transform transition-all duration-200 
                  ${disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:-translate-y-12 hover:scale-110'}
                  ${selected ? 'ring-4 ring-yellow-400 -translate-y-8 scale-110 z-50' : 'z-0'}
                  ${isDrawnCard ? 'ring-4 ring-green-400 -translate-y-8 scale-110 z-50' : ''}`}
              >
                <CardComponent
                  card={card}
                  onClick={() => handleCardClick(card)}
                  disabled={disabled && !isDrawnCard}
                  className={`${isMyTurn && !disabled ? 'shadow-2xl shadow-white/20 hover:shadow-yellow-400/40' : 'shadow-lg'}`}
                />
              </motion.div>
            )
          })}
        </div>

        {/* Multi-card Play Button */}
        {selectedCardIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 px-8 py-4 rounded-full text-white font-bold flex items-center gap-3 shadow-2xl shadow-green-500/60 cursor-pointer hover:shadow-green-500/80 transition-all hover:scale-110 z-50"
            onClick={handlePlaySelected}
          >
            <Play size={22} />
            <span className="text-lg">Play {selectedCardIds.size} Card{selectedCardIds.size > 1 ? 's' : ''}</span>
          </motion.div>
        )}
      </div>

      <Chat />

      {/* Wild Color Picker Modal (Used for regular wild and drawn wild) */}
      <AnimatePresence>
        {(wildCardIds || drawnWildPlayCardId) && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
                <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="bg-white p-8 rounded-3xl shadow-2xl text-center"
                >
                    <h3 className="text-3xl font-black mb-8 text-slate-900">Choose a Color</h3>
                    <div className="grid grid-cols-2 gap-6">
                        {['red', 'blue', 'green', 'yellow'].map((c) => (
                            <motion.button
                                key={c}
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => handleColorSelect(c as Color)}
                                className={`w-28 h-28 rounded-2xl shadow-lg transform transition-transform font-bold text-xl
                                    ${c === 'red' ? 'bg-red-500 text-red-50' : 
                                      c === 'blue' ? 'bg-blue-500 text-blue-50' :
                                      c === 'green' ? 'bg-green-500 text-green-50' :
                                      'bg-yellow-400 text-yellow-900'}`}
                            >
                                {c.toUpperCase()}
                            </motion.button>
                        ))}
                    </div>
                </motion.div>
            </div>
        )}
      </AnimatePresence>

      {/* Blank Wild Rule Picker Modal */}
      <AnimatePresence>
        {blankWildCardId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
                <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="bg-gradient-to-br from-purple-600 to-indigo-600 p-8 rounded-3xl shadow-2xl text-center max-w-md"
                >
                    <h3 className="text-3xl font-black mb-2 text-white flex items-center justify-center gap-2">
                        <Zap size={32} /> Choose a Rule
                    </h3>
                    <p className="text-purple-100 mb-8 text-sm">Your special power!</p>
                    <div className="grid grid-cols-1 gap-4">
                        {[
                            { id: 'skip_all', name: 'Skip All', desc: 'Everyone skips once' },
                            { id: 'reverse_twice', name: 'Reverse Twice', desc: 'Reverse direction twice' },
                            { id: 'draw_two_all', name: 'Draw Two All', desc: 'Everyone draws 2 cards' },
                        ].map((rule) => (
                            <motion.button
                                key={rule.id}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => handleRuleSelect(rule.id)}
                                className="w-full px-6 py-4 rounded-xl bg-white/20 hover:bg-white/30 transition-all text-white font-bold border-2 border-white/50"
                            >
                                <div className="text-lg">{rule.name}</div>
                                <div className="text-xs opacity-90">{rule.desc}</div>
                            </motion.button>
                        ))}
                    </div>
                </motion.div>
            </div>
        )}
      </AnimatePresence>

      {/* Rule 4: Shuffle Hand Configuration Modal */}
      <AnimatePresence>
        {shuffleCardId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
                <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="bg-slate-900 p-8 rounded-3xl shadow-2xl text-center max-w-lg w-full border border-slate-700"
                >
                    <h3 className="text-3xl font-black mb-6 text-white flex items-center justify-center gap-3">
                        <ArrowLeftRight size={32} className="text-blue-400" /> 
                        Shuffle Hands
                    </h3>
                    
                    {!shuffleAction ? (
                        <div className="flex flex-col gap-4">
                            <button 
                                onClick={() => setShuffleAction('swap_with')}
                                className="bg-slate-800 hover:bg-slate-700 p-6 rounded-2xl text-white font-bold text-lg transition-colors border border-slate-600 flex items-center justify-center gap-3"
                            >
                                <User size={24} className="text-green-400" />
                                Swap with someone
                            </button>
                            <button 
                                onClick={() => setShuffleAction('swap_two')}
                                className="bg-slate-800 hover:bg-slate-700 p-6 rounded-2xl text-white font-bold text-lg transition-colors border border-slate-600 flex items-center justify-center gap-3"
                            >
                                <Users size={24} className="text-purple-400" />
                                Make 2 players swap
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-6">
                            <p className="text-slate-300 font-medium">
                                {shuffleAction === 'swap_with' ? 'Select 1 player to swap your hand with:' : 'Select 2 players to swap their hands:'}
                            </p>
                            <div className="flex flex-wrap justify-center gap-4">
                                {players.filter(p => shuffleAction === 'swap_two' ? true : p.id !== myPlayerId).map(p => {
                                    const isSelected = shuffleTargetIds.includes(p.id);
                                    return (
                                        <button
                                            key={p.id}
                                            onClick={() => handleShuffleTargetSelect(p.id)}
                                            className={`px-6 py-4 rounded-xl font-bold transition-all border-2
                                                ${isSelected ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-500/50' : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700'}`}
                                        >
                                            {p.name} ({p.hand.length} cards)
                                        </button>
                                    );
                                })}
                            </div>
                            
                            <div className="flex gap-4 mt-4">
                                <button 
                                    onClick={() => { setShuffleAction(null); setShuffleTargetIds([]); }}
                                    className="flex-1 bg-slate-700 text-white py-3 rounded-xl font-bold hover:bg-slate-600"
                                >
                                    Back
                                </button>
                                <button 
                                    onClick={confirmShuffle}
                                    disabled={(shuffleAction === 'swap_with' && shuffleTargetIds.length !== 1) || (shuffleAction === 'swap_two' && shuffleTargetIds.length !== 2)}
                                    className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Confirm Swap
                                </button>
                            </div>
                        </div>
                    )}
                </motion.div>
            </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default GameTable;
