import React, { useState } from 'react';
import { useGame } from '../context/GameContext';
import CardComponent from './Card';
import Chat from './Chat';
import { Card, Color } from '../utils/gameLogic';
import { motion, AnimatePresence } from 'framer-motion';
import { User, ArrowRight, RotateCcw } from 'lucide-react';

const GameTable: React.FC = () => {
  const { gameState, myPlayerId, playCard, drawCard, isHost, startGame } = useGame();
  const [wildCardId, setWildCardId] = useState<string | null>(null);

  if (!gameState) return null;

  const { players, currentPlayerIndex, discardPile, direction, currentColor, winner, status, lastAction } = gameState;
  
  const me = players.find(p => p.id === myPlayerId);
  const isMyTurn = players[currentPlayerIndex].id === myPlayerId;
  const topCard = discardPile[discardPile.length - 1];

  // Opponents are everyone else, rotated so the next player is first? 
  // Or just list them in order. Let's just filter out me.
  const opponents = players.filter(p => p.id !== myPlayerId);

  const handleCardClick = (card: Card) => {
    if (!isMyTurn) return;
    if (card.color === 'black') {
      setWildCardId(card.id);
    } else {
      playCard(card.id);
    }
  };

  const handleColorSelect = (color: Color) => {
    if (wildCardId) {
      playCard(wildCardId, color);
      setWildCardId(null);
    }
  };

  if (status === 'ended' && winner) {
      return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
              <motion.div 
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-white p-12 rounded-3xl text-center shadow-2xl max-w-lg w-full"
              >
                  <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500 mb-4">
                      {winner === me?.name ? 'VICTORY!' : 'GAME OVER'}
                  </h1>
                  <p className="text-2xl text-slate-600 mb-8">
                      <span className="font-bold text-slate-900">{winner}</span> won the game!
                  </p>
                  
                  {isHost && (
                      <button onClick={startGame} className="px-8 py-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200">
                          Play Again
                      </button>
                  )}
              </motion.div>
          </div>
      );
  }

  return (
    <div className="relative w-full h-screen bg-slate-800 overflow-hidden flex flex-col">
      {/* Background Texture */}
      <div className="absolute inset-0 opacity-10 pointer-events-none" 
           style={{ backgroundImage: `radial-gradient(circle at 2px 2px, white 1px, transparent 0)`, backgroundSize: '40px 40px' }} 
      />

      {/* Opponents Area */}
      <div className="flex-1 flex items-start justify-center pt-8 gap-4 md:gap-8 px-4 flex-wrap content-start">
        {opponents.map((p) => {
           const isCurrent = players[currentPlayerIndex].id === p.id;
           return (
            <motion.div 
                key={p.id}
                animate={{ scale: isCurrent ? 1.1 : 1, opacity: isCurrent ? 1 : 0.7 }}
                className={`relative flex flex-col items-center p-4 rounded-xl transition-colors ${isCurrent ? 'bg-indigo-500/20 ring-2 ring-indigo-400' : 'bg-slate-700/30'}`}
            >
                <div className="relative">
                    <div className="w-16 h-16 rounded-full bg-slate-600 flex items-center justify-center border-4 border-slate-500 overflow-hidden">
                        <User size={32} className="text-slate-300" />
                    </div>
                    <div className="absolute -bottom-2 -right-2 bg-slate-900 text-white text-xs px-2 py-1 rounded-full border border-slate-600">
                        {p.hand.length} Cards
                    </div>
                </div>
                <span className="mt-2 font-bold text-white text-sm truncate max-w-[100px]">{p.name}</span>
                {isCurrent && (
                     <motion.div 
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="absolute -top-8 text-indigo-300 text-xs font-bold animate-bounce"
                     >
                         THINKING...
                     </motion.div>
                )}
            </motion.div>
           );
        })}
      </div>

      {/* Center Table Area */}
      <div className="flex-1 flex items-center justify-center gap-8 md:gap-16 relative z-0">
          
          {/* Deck */}
          <div className="relative group cursor-pointer" onClick={isMyTurn ? drawCard : undefined}>
              <div className="w-24 md:w-32 aspect-[2/3] bg-slate-900 rounded-xl border-4 border-white shadow-2xl flex items-center justify-center relative transform rotate-3 group-hover:rotate-0 transition-transform">
                  <div className="w-20 h-28 border-2 border-slate-700 rounded-lg flex items-center justify-center">
                      <span className="text-2xl font-black text-slate-700">UNO</span>
                  </div>
              </div>
              {/* Stack effect */}
              <div className="absolute top-1 left-1 w-full h-full bg-slate-800 rounded-xl border border-slate-600 -z-10" />
              <div className="absolute top-2 left-2 w-full h-full bg-slate-800 rounded-xl border border-slate-600 -z-20" />
              
              {isMyTurn && (
                  <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap text-white font-bold text-sm bg-black/50 px-3 py-1 rounded-full">
                      Draw Card
                  </div>
              )}
          </div>

          {/* Discard Pile */}
          <div className="relative">
               {topCard && <CardComponent card={topCard} disabled />}
               {/* Current Color Indicator (Ring) */}
               <div className={`absolute -inset-4 rounded-3xl border-4 opacity-50 pointer-events-none animate-pulse
                    ${currentColor === 'red' ? 'border-red-500' : 
                      currentColor === 'blue' ? 'border-blue-500' :
                      currentColor === 'green' ? 'border-green-500' :
                      'border-yellow-400'}`} 
                />
          </div>

          {/* Info / Direction */}
          <div className="absolute right-8 md:right-32 flex flex-col items-center gap-4">
               <div className={`p-4 rounded-full bg-slate-900/50 backdrop-blur-sm border border-slate-700 text-white transition-transform duration-500 ${direction === -1 ? '-scale-x-100' : ''}`}>
                   {direction === 1 ? <ArrowRight size={32} /> : <RotateCcw size={32} />}
               </div>
               <div className="w-16 h-16 rounded-full shadow-lg border-4 border-white relative overflow-hidden">
                   <div className={`absolute inset-0 ${
                       currentColor === 'red' ? 'bg-red-500' :
                       currentColor === 'blue' ? 'bg-blue-500' :
                       currentColor === 'green' ? 'bg-green-500' :
                       'bg-yellow-400'
                   }`} />
               </div>
               <span className="text-white font-bold text-sm">Current Color</span>
          </div>

      </div>

      {/* Action Log (Toast) */}
      <AnimatePresence>
         {lastAction && (
             <motion.div 
                key={lastAction}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/60 backdrop-blur-md px-6 py-3 rounded-full text-white font-bold z-10 pointer-events-none"
             >
                 {lastAction}
             </motion.div>
         )}
      </AnimatePresence>

      {/* My Hand */}
      <div className="relative z-10 w-full min-h-[180px] bg-gradient-to-t from-black/80 to-transparent flex flex-col justify-end pb-4 pt-12 overflow-visible">
         {/* Status Text */}
         <div className="absolute top-4 left-0 right-0 text-center">
             {isMyTurn ? (
                 <span className="text-2xl font-bold text-white drop-shadow-lg animate-pulse">YOUR TURN</span>
             ) : (
                 <span className="text-lg font-medium text-slate-300">Waiting for {players[currentPlayerIndex].name}...</span>
             )}
         </div>

         {/* Cards */}
         <div className="flex justify-center items-end -space-x-8 md:-space-x-12 px-4 overflow-x-auto pb-4 pt-8 min-h-[160px]">
            {me?.hand.map((card, i) => (
                <motion.div
                    key={card.id}
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: i * 0.05 }}
                    className="origin-bottom transform hover:-translate-y-8 hover:scale-110 transition-transform duration-200 z-0 hover:z-20"
                >
                    <CardComponent 
                        card={card} 
                        onClick={() => handleCardClick(card)}
                        disabled={!isMyTurn} // Disable visually, but logic also checks
                        className={isMyTurn ? 'shadow-2xl shadow-white/20' : 'brightness-75'}
                    />
                </motion.div>
            ))}
         </div>
      </div>

      <Chat />

      {/* Wild Color Picker Modal */}
      <AnimatePresence>
        {wildCardId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
                <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="bg-white p-6 rounded-3xl shadow-2xl text-center"
                >
                    <h3 className="text-2xl font-bold mb-6 text-slate-900">Choose Color</h3>
                    <div className="grid grid-cols-2 gap-4">
                        {['red', 'blue', 'green', 'yellow'].map((c) => (
                            <button
                                key={c}
                                onClick={() => handleColorSelect(c as Color)}
                                className={`w-24 h-24 rounded-2xl shadow-lg transform hover:scale-105 transition-transform
                                    ${c === 'red' ? 'bg-red-500' : 
                                      c === 'blue' ? 'bg-blue-500' :
                                      c === 'green' ? 'bg-green-500' :
                                      'bg-yellow-400'}`}
                            />
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
