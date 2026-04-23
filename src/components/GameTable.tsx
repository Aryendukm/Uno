import React, { useState } from 'react';
import { useGame } from '../context/GameContext';
import CardComponent from './Card';
import Chat from './Chat';
import { Card, Color, isValidPlay } from '../utils/gameLogic';
import { motion, AnimatePresence } from 'framer-motion';
import { User, ArrowRight, RotateCcw, Play, Zap } from 'lucide-react';

const GameTable: React.FC = () => {
  const { gameState, myPlayerId, playCard, drawCard, isHost, startGame, applyRule } = useGame();
  const [wildCardId, setWildCardId] = useState<string | null>(null);
  const [blankWildCardId, setBlankWildCardId] = useState<string | null>(null);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());

  if (!gameState) return null;

  const { players, currentPlayerIndex, discardPile, direction, currentColor, winner, status, lastAction, unoCalledBy } = gameState;
  
  const me = players.find(p => p.id === myPlayerId);
  const isMyTurn = players[currentPlayerIndex].id === myPlayerId;
  const topCard = discardPile[discardPile.length - 1];

  const handleCardClick = (card: Card) => {
    if (!isMyTurn) return;
    
    // If it's a wild card, open color picker
    if (card.value === 'wild') {
      setWildCardId(card.id);
      return;
    }

    // If it's a blank wild, open rule picker
    if (card.value === 'blank_wild') {
      setBlankWildCardId(card.id);
      return;
    }

    // For non-wild cards, allow multi-selection of same-numbered cards
    const newSelected = new Set(selectedCardIds);
    if (newSelected.has(card.id)) {
      newSelected.delete(card.id);
    } else {
      // Check if we can add this card (must be same number as first selected)
      if (newSelected.size > 0 && me?.hand) {
        const firstSelectedCard = me.hand.find(c => newSelected.has(c.id));
        if (firstSelectedCard && firstSelectedCard.value !== card.value) {
          // Cannot mix different numbers
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

    // Play all selected cards with animation
    cardsToPlay.forEach((card, index) => {
      setTimeout(() => {
        playCard(card.id);
      }, index * 150);
    });
    
    setSelectedCardIds(new Set());
  };

  const handleColorSelect = (color: Color) => {
    if (wildCardId) {
      playCard(wildCardId, color);
      setWildCardId(null);
    }
  };

  const handleRuleSelect = (rule: string) => {
    if (blankWildCardId) {
      playCard(blankWildCardId);
      applyRule(rule);
      setBlankWildCardId(null);
    }
  };

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

          {/* Players positioned around the circle */}
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

                {/* Current Indicator */}
                {isCurrent && (
                  <motion.div
                    animate={{ y: [0, -8, 0] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="text-xl"
                  >
                    ➡️
                  </motion.div>
                )}
              </motion.div>
            );
          })}

          {/* Center - Deck and Discard Pile */}
          <div className="absolute flex items-center justify-center gap-16 z-20">
            {/* Deck */}
            <motion.div
              whileHover={{ scale: 1.08 }}
              className="relative group cursor-pointer"
              onClick={isMyTurn ? drawCard : undefined}
            >
              <div className="w-20 h-28 md:w-24 md:h-32 bg-gradient-to-br from-blue-700 to-blue-900 rounded-xl border-4 border-white shadow-2xl flex items-center justify-center relative hover:shadow-blue-500/50 transition-all">
                <div className="w-16 h-24 md:w-20 md:h-28 border-2 border-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-lg md:text-2xl font-black text-blue-400">UNO</span>
                </div>
              </div>
              <div className="absolute top-1 left-1 w-full h-full bg-blue-800 rounded-xl border border-blue-700 -z-10" />
              <div className="absolute top-2 left-2 w-full h-full bg-blue-900 rounded-xl border border-blue-800 -z-20" />
              
              {isMyTurn && (
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-blue-300 font-bold text-xs bg-black/70 px-3 py-1 rounded-full"
                >
                  Draw Card
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

            {/* Direction Indicator */}
            <motion.div
              className="absolute right-12 top-1/2 -translate-y-1/2"
              animate={{ rotateZ: direction === -1 ? 180 : 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="p-3 rounded-full bg-gradient-to-br from-indigo-500/40 to-purple-500/40 border-2 border-indigo-400/50 text-white">
                <ArrowRight size={28} />
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Action Log (Toast) */}
      <AnimatePresence>
        {lastAction && (
          <motion.div
            key={lastAction}
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-8 left-1/2 -translate-x-1/2 bg-gradient-to-r from-blue-600/95 to-purple-600/95 backdrop-blur-md px-8 py-4 rounded-full text-white font-bold z-50 shadow-2xl shadow-blue-500/60 max-w-md text-center"
          >
            {lastAction}
          </motion.div>
        )}
      </AnimatePresence>

      {/* My Hand - Bottom */}
      <div className="relative z-10 w-full min-h-[220px] bg-gradient-to-t from-black/95 via-black/70 to-transparent flex flex-col justify-end pb-8 pt-20 overflow-visible">
        {/* Status Text */}
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
          {me?.hand.map((card, i) => (
            <motion.div
              key={card.id}
              initial={{ y: 100, opacity: 0, rotateZ: -20 }}
              animate={{ y: 0, opacity: 1, rotateZ: 0 }}
              transition={{ delay: i * 0.05, type: 'spring' }}
              className={`origin-bottom transform hover:-translate-y-12 hover:scale-120 transition-all duration-200 cursor-pointer
                ${selectedCardIds.has(card.id) ? 'ring-4 ring-yellow-400 -translate-y-8 scale-120 z-50' : 'z-0 hover:z-40'}`}
            >
              <CardComponent
                card={card}
                onClick={() => handleCardClick(card)}
                disabled={!isMyTurn}
                className={`${
                  isMyTurn
                    ? 'shadow-2xl shadow-white/40 hover:shadow-yellow-400/60'
                    : 'opacity-90 shadow-lg'
                } ${selectedCardIds.has(card.id) ? 'ring-4 ring-yellow-400' : ''} transform transition-all`}
              />
            </motion.div>
          ))}
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
            <span className="text-lg">Play {selectedCardIds.size}</span>
          </motion.div>
        )}
      </div>

      <Chat />

      {/* Wild Color Picker Modal */}
      <AnimatePresence>
        {wildCardId && (
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
                            { id: 'everyone_swaps', name: 'Swap All', desc: 'Everyone swaps hands' }
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
    </div>
  );
};

export default GameTable;
