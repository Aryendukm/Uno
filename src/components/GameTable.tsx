import React, { useState } from 'react';
import { useGame } from '../context/GameContext';
import CardComponent from './Card';
import Chat from './Chat';
import { Card, Color } from '../utils/gameLogic';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Play, Zap, ArrowLeftRight, Users } from 'lucide-react';

// ─── Player Position Helper ───────────────────────────────────────────────────
//
// We always render ME at the bottom-centre. The remaining players are arranged
// in a fixed arc across the top half of the table.  The arc positions are
// pre-defined per opponent count so the layout is always balanced.
//
// Positions are expressed as { x, y } percentage of the table container,
// where (50, 50) is the centre.

type ArcPos = { x: number; y: number };

/**
 * Returns arc positions for N opponents arranged across the top of the table.
 * The current player (me) is always at bottom-centre and is not included here.
 */
function getOpponentPositions(opponentCount: number): ArcPos[] {
  switch (opponentCount) {
    case 1: return [{ x: 50, y: 8 }];
    case 2: return [{ x: 22, y: 12 }, { x: 78, y: 12 }];
    case 3: return [{ x: 15, y: 20 }, { x: 50, y: 7 }, { x: 85, y: 20 }];
    case 4: return [{ x: 10, y: 30 }, { x: 30, y: 8 }, { x: 70, y: 8 }, { x: 90, y: 30 }];
    case 5: return [{ x: 8, y: 38 }, { x: 20, y: 12 }, { x: 50, y: 5 }, { x: 80, y: 12 }, { x: 92, y: 38 }];
    case 6: return [{ x: 8, y: 45 }, { x: 12, y: 20 }, { x: 35, y: 7 }, { x: 65, y: 7 }, { x: 88, y: 20 }, { x: 92, y: 45 }];
    default: return [];
  }
}

const GameTable: React.FC = () => {
  const {
    gameState, myPlayerId, playCards, drawCard, playDrawnCard,
    isHost, startGame, applyRule
  } = useGame();

  const [wildCardIds, setWildCardIds]         = useState<string[] | null>(null);
  const [blankWildCardId, setBlankWildCardId] = useState<string | null>(null);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());

  const [shuffleCardId, setShuffleCardId]     = useState<string | null>(null);
  const [shuffleAction, setShuffleAction]     = useState<'swap_with' | 'swap_two' | null>(null);
  const [shuffleTargetIds, setShuffleTargetIds] = useState<string[]>([]);

  const [drawnWildPlayCardId, setDrawnWildPlayCardId] = useState<string | null>(null);

  if (!gameState) return null;

  const {
    players, currentPlayerIndex, discardPile, direction, currentColor,
    winner, status, lastAction, unoCalledBy, pendingWild4Stack, drawnCardId
  } = gameState;

  const me        = players.find(p => p.id === myPlayerId);
  const myIndex   = players.findIndex(p => p.id === myPlayerId);
  const isMyTurn  = players[currentPlayerIndex].id === myPlayerId;
  const topCard   = discardPile[discardPile.length - 1];

  // Opponents in turn order starting from the player after me
  const opponents = players.filter(p => p.id !== myPlayerId);
  const arcPositions = getOpponentPositions(opponents.length);

  // ─── Card Selection Handlers ───────────────────────────────────────────────

  const handleCardClick = (card: Card) => {
    if (!isMyTurn) return;
    if (drawnCardId) return; // Must resolve draw-and-play first

    if (pendingWild4Stack > 0) {
      if (card.value !== 'wild4') return;
      const next = new Set(selectedCardIds);
      next.has(card.id) ? next.delete(card.id) : next.add(card.id);
      setSelectedCardIds(next);
      return;
    }

    const next = new Set(selectedCardIds);
    if (next.has(card.id)) {
      next.delete(card.id);
    } else {
      if (next.size > 0 && me?.hand) {
        const firstSelected = me.hand.find(c => next.has(c.id));
        if (firstSelected && firstSelected.value !== card.value) return; // Value mismatch
      }
      next.add(card.id);
    }
    setSelectedCardIds(next);
  };

  const handlePlaySelected = () => {
    if (selectedCardIds.size === 0 || !me) return;
    const cardsToPlay = me.hand.filter(c => selectedCardIds.has(c.id));
    if (cardsToPlay.length === 0) return;

    const first = cardsToPlay[0];
    if (first.value === 'wild' || first.value === 'wild4') {
      setWildCardIds(Array.from(selectedCardIds));
      setSelectedCardIds(new Set());
      return;
    }
    if (first.value === 'blank_wild') {
      setBlankWildCardId(first.id);
      setSelectedCardIds(new Set());
      return;
    }
    if (first.value === 'shuffle') {
      setShuffleCardId(first.id);
      setShuffleAction(null);
      setShuffleTargetIds([]);
      setSelectedCardIds(new Set());
      return;
    }
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

  const handleDrawAndPlayDecision = (play: boolean) => {
    if (!play) { playDrawnCard(false); return; }
    const drawnCard = me?.hand.find(c => c.id === drawnCardId);
    if (!drawnCard) return;
    if (drawnCard.color === 'black') {
      setDrawnWildPlayCardId(drawnCard.id);
    } else {
      playDrawnCard(true);
    }
  };

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
    const needed = shuffleAction === 'swap_with' ? 1 : 2;
    if (shuffleTargetIds.length !== needed) return;
    playCards([shuffleCardId], undefined, shuffleAction, shuffleTargetIds);
    setShuffleCardId(null);
    setShuffleAction(null);
    setShuffleTargetIds([]);
  };

  // ─── Win Screen ────────────────────────────────────────────────────────────

  if (status === 'ended' && winner) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm casino-felt">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="casino-panel p-16 rounded-3xl text-center shadow-2xl max-w-lg w-full mx-4"
        >
          <h1 className="text-7xl font-black text-gold font-display mb-6">
            {winner === me?.name ? '🎉 VICTORY!' : 'GAME OVER'}
          </h1>
          <p className="text-2xl text-stone-300 mb-10">
            <span className="font-bold text-gold">{winner}</span> won the game!
          </p>
          {isHost && (
            <button
              onClick={startGame}
              className="btn-gold px-12 py-5 rounded-2xl font-display tracking-widest text-lg"
            >
              PLAY AGAIN
            </button>
          )}
        </motion.div>
      </div>
    );
  }

  const drawnCardToPlay = drawnCardId ? me?.hand.find(c => c.id === drawnCardId) : null;

  // ─── Colour indicator classes ──────────────────────────────────────────────
  const colorBorderClass = {
    red: 'border-red-500 shadow-red-500/40',
    blue: 'border-blue-500 shadow-blue-500/40',
    green: 'border-green-500 shadow-green-500/40',
    yellow: 'border-yellow-400 shadow-yellow-400/40',
    black: 'border-purple-500 shadow-purple-500/40',
  }[currentColor];

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="relative w-full h-screen casino-felt overflow-hidden flex flex-col">

      {/* ── Action Log ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {lastAction && (
          <motion.div
            key={lastAction}
            initial={{ opacity: 0, y: -16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12 }}
            className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-black/80 backdrop-blur-md
                       border border-gold/30 text-gold px-7 py-3 rounded-full font-medium text-sm
                       shadow-2xl max-w-xl text-center pointer-events-none"
          >
            {lastAction}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── +4 Stack Warning ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {pendingWild4Stack > 0 && isMyTurn && !drawnCardId && (
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-40 bg-red-700/95 border-4 border-red-400
                       text-white px-10 py-5 rounded-2xl shadow-2xl text-center backdrop-blur-sm"
          >
            <div className="text-3xl font-black mb-1">🔥 +{pendingWild4Stack} INCOMING! 🔥</div>
            <div className="text-sm font-semibold opacity-90">Play a +4 to stack, or click the deck to accept.</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── TABLE AREA (flex-1, fills screen above the hand strip) ─────────── */}
      <div className="relative flex-1 overflow-hidden">

        {/* Felt oval */}
        <div className="absolute inset-[6%] rounded-[50%]
                        bg-gradient-to-br from-green-900/40 to-emerald-950/60
                        border-4 border-green-700/40 shadow-[inset_0_0_60px_rgba(0,0,0,0.6)]" />

        {/* ── Opponents ────────────────────────────────────────────────────── */}
        {opponents.map((player, idx) => {
          const pos       = arcPositions[idx] ?? { x: 50, y: 10 };
          const isCurrent = players[currentPlayerIndex].id === player.id;
          const hasUno    = unoCalledBy?.[player.id];

          return (
            <motion.div
              key={player.id}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{
                position: 'absolute',
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                transform: 'translate(-50%, -50%)',
              }}
              className="flex flex-col items-center gap-2 z-10"
            >
              {/* Avatar ring */}
              <motion.div
                animate={{ scale: isCurrent ? 1.12 : 1 }}
                transition={{ duration: 0.3 }}
                className={`relative w-20 h-20 rounded-full flex items-center justify-center border-4 transition-all
                  ${isCurrent
                    ? 'bg-yellow-500/30 border-yellow-400 shadow-[0_0_24px_8px_rgba(234,179,8,0.6)]'
                    : 'bg-slate-700/60 border-slate-500 shadow-lg'}`}
              >
                <User size={38} className={isCurrent ? 'text-yellow-300' : 'text-slate-300'} />
                {/* Card count badge */}
                <div className={`absolute -bottom-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center
                                 text-xs font-black border-2 shadow-md
                                 ${isCurrent ? 'bg-yellow-500 border-yellow-300 text-slate-900' : 'bg-slate-600 border-slate-400 text-white'}`}>
                  {player.hand.length}
                </div>
              </motion.div>

              {/* Name */}
              <div className="text-center">
                <div className={`font-bold text-sm px-3 py-1 rounded-lg
                  ${isCurrent ? 'text-yellow-300 bg-yellow-900/40' : 'text-slate-200'}`}>
                  {player.name}
                </div>
                {hasUno && (
                  <motion.div
                    animate={{ scale: [1, 1.15, 1] }}
                    transition={{ duration: 0.6, repeat: Infinity }}
                    className="text-red-400 font-black text-sm mt-1"
                  >
                    🎺 UNO!
                  </motion.div>
                )}
              </div>

              {/* Back-of-card stack (visual only) */}
              {player.hand.length > 0 && (
                <div className="relative h-10 w-16 mt-1">
                  {Array.from({ length: Math.min(player.hand.length, 5) }).map((_, i) => (
                    <div
                      key={i}
                      className="absolute rounded-md bg-gradient-to-br from-blue-700 to-blue-900 border border-white/30"
                      style={{
                        width: 32, height: 44,
                        left: i * 4,
                        top: -i * 1,
                        transform: `rotate(${(i - 2) * 3}deg)`,
                        zIndex: i,
                      }}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          );
        })}

        {/* ── Centre: Deck + Discard ────────────────────────────────────────── */}
        <div className="absolute inset-0 flex items-center justify-center gap-16 z-20 pointer-events-none">

          {/* Draw Deck */}
          <motion.div
            whileHover={(isMyTurn && !drawnCardId) ? { scale: 1.08, y: -4 } : {}}
            className={`relative pointer-events-auto
              ${(isMyTurn && !drawnCardId) ? 'cursor-pointer' : 'cursor-not-allowed'}`}
            onClick={(isMyTurn && !drawnCardId) ? drawCard : undefined}
          >
            {/* Stack depth layers */}
            <div className="absolute top-3 left-3 w-28 h-40 md:w-32 md:h-44 bg-blue-950 rounded-xl border border-blue-800 -z-20" />
            <div className="absolute top-1.5 left-1.5 w-28 h-40 md:w-32 md:h-44 bg-blue-900 rounded-xl border border-blue-700 -z-10" />
            {/* Main card */}
            <div className="w-28 h-40 md:w-32 md:h-44 bg-gradient-to-br from-blue-600 to-blue-900 rounded-xl
                            border-4 border-white shadow-2xl flex items-center justify-center">
              <div className="w-20 h-32 md:w-24 md:h-36 border-2 border-blue-500/60 rounded-lg
                              flex items-center justify-center">
                <span className="text-2xl md:text-3xl font-black text-blue-300 font-display tracking-widest">UNO</span>
              </div>
            </div>
            {/* Draw label */}
            {isMyTurn && !drawnCardId && pendingWild4Stack === 0 && (
              <motion.div
                animate={{ opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 1.4, repeat: Infinity }}
                className="absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap
                           text-blue-300 font-bold text-xs bg-black/70 px-4 py-1.5 rounded-full border border-blue-700/40"
              >
                Draw Card
              </motion.div>
            )}
            {/* Penalty label */}
            {isMyTurn && !drawnCardId && pendingWild4Stack > 0 && (
              <motion.div
                animate={{ opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 0.8, repeat: Infinity }}
                className="absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap
                           text-red-300 font-bold text-xs bg-red-950/80 px-4 py-1.5 rounded-full border border-red-500/60"
              >
                Draw {pendingWild4Stack} Penalty!
              </motion.div>
            )}
          </motion.div>

          {/* Discard Pile */}
          <div className="relative pointer-events-none">
            {/* Active colour halo */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
              className={`absolute -inset-4 rounded-2xl border-4 opacity-60 pointer-events-none shadow-lg ${colorBorderClass}`}
            />
            {topCard && (
              <motion.div
                key={topCard.id}
                initial={{ scale: 0.6, rotateZ: -120, opacity: 0 }}
                animate={{ scale: 1, rotateZ: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 220, damping: 18 }}
              >
                <CardComponent card={topCard} disabled />
              </motion.div>
            )}
            {/* Direction indicator */}
            <div className={`absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap
                             text-xs font-bold px-3 py-1 rounded-full border
                             ${direction === 1 ? 'text-green-300 border-green-700/50 bg-green-950/60'
                                               : 'text-orange-300 border-orange-700/50 bg-orange-950/60'}`}>
              {direction === 1 ? '↻ Clockwise' : '↺ Counter'}
            </div>
          </div>
        </div>
      </div>

      {/* ── MY HAND STRIP (fixed bottom) ──────────────────────────────────── */}
      <div className="relative z-30 bg-gradient-to-t from-black via-black/90 to-transparent pt-6 pb-4 px-4">

        {/* Turn label */}
        <div className="text-center mb-3">
          {isMyTurn ? (
            <motion.span
              animate={{ scale: [1, 1.06, 1] }}
              transition={{ duration: 0.8, repeat: Infinity }}
              className="text-2xl md:text-3xl font-black text-gold font-display tracking-widest drop-shadow-lg"
            >
              🎮 YOUR TURN
            </motion.span>
          ) : (
            <span className="text-base font-medium text-slate-400">
              Waiting for{' '}
              <span className="font-bold text-yellow-300">{players[currentPlayerIndex]?.name}</span>...
            </span>
          )}
        </div>

        {/* Me avatar row */}
        <div className="flex items-center justify-center gap-3 mb-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center border-3 border-green-400 bg-green-900/40`}>
            <User size={20} className="text-green-300" />
          </div>
          <span className="text-green-400 font-bold text-sm">You</span>
          {me && (
            <span className="text-slate-400 text-xs">({me.hand.length} card{me.hand.length !== 1 ? 's' : ''})</span>
          )}
          {me && unoCalledBy?.[me.id] && (
            <motion.span
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 0.5, repeat: Infinity }}
              className="text-red-400 font-black text-sm"
            >
              🎺 UNO!
            </motion.span>
          )}
        </div>

        {/* Cards scroll row */}
        <div className="flex justify-center items-end overflow-x-auto scrollbar-hide
                        pb-2 -space-x-4 md:-space-x-6 min-h-[140px] px-2">
          {me?.hand.map((card, i) => {
            const isDrawn    = card.id === drawnCardId;
            const isSelected = selectedCardIds.has(card.id);
            const disabled   = !isMyTurn
              || (!!drawnCardId && !isDrawn)
              || (pendingWild4Stack > 0 && card.value !== 'wild4');

            return (
              <motion.div
                key={card.id}
                initial={{ y: 80, opacity: 0, rotateZ: -15 }}
                animate={{
                  y: isSelected || isDrawn ? -24 : 0,
                  opacity: 1,
                  rotateZ: 0,
                  scale: isSelected || isDrawn ? 1.08 : 1,
                }}
                transition={{ delay: i * 0.04, type: 'spring', stiffness: 260, damping: 22 }}
                className={`origin-bottom transition-all duration-150
                  ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:-translate-y-8 hover:scale-105'}
                  ${isSelected ? 'ring-4 ring-yellow-400 rounded-xl z-50' : ''}
                  ${isDrawn ? 'ring-4 ring-green-400 rounded-xl z-50' : ''}`}
                onClick={() => !disabled && handleCardClick(card)}
              >
                <CardComponent
                  card={card}
                  disabled={disabled && !isDrawn}
                  className="shadow-2xl"
                />
              </motion.div>
            );
          })}
        </div>

        {/* Play button */}
        <AnimatePresence>
          {selectedCardIds.size > 0 && (
            <motion.button
              initial={{ opacity: 0, y: 16, scale: 0.85 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.85 }}
              onClick={handlePlaySelected}
              className="mx-auto mt-3 flex items-center gap-3 px-10 py-4 rounded-full font-bold text-lg
                         bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500
                         text-white shadow-2xl shadow-green-500/50 hover:shadow-green-400/70
                         hover:scale-105 transition-all"
            >
              <Play size={22} />
              Play {selectedCardIds.size} Card{selectedCardIds.size > 1 ? 's' : ''}
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* ── Draw-and-Play Modal ────────────────────────────────────────────── */}
      <AnimatePresence>
        {isMyTurn && drawnCardId && !drawnWildPlayCardId && drawnCardToPlay && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="fixed bottom-64 left-1/2 -translate-x-1/2 z-50
                       casino-panel border border-gold/30 text-white px-10 py-8
                       rounded-3xl shadow-2xl text-center flex flex-col items-center gap-5 min-w-[320px]"
          >
            <h3 className="text-2xl font-black text-yellow-300 font-display">You Drew!</h3>
            <div className="transform scale-90 origin-top">
              <CardComponent card={drawnCardToPlay} disabled />
            </div>
            <div className="flex gap-4 w-full">
              <button
                onClick={() => handleDrawAndPlayDecision(true)}
                className="flex-1 bg-green-600 hover:bg-green-500 py-4 rounded-2xl font-bold text-lg transition-colors"
              >
                Play It
              </button>
              <button
                onClick={() => handleDrawAndPlayDecision(false)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 py-4 rounded-2xl font-bold text-lg transition-colors"
              >
                Keep & Pass
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Chat />

      {/* ── Wild Colour Picker ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {(wildCardIds || drawnWildPlayCardId) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              className="casino-panel p-10 rounded-3xl shadow-2xl text-center"
            >
              <h3 className="text-4xl font-black mb-10 text-gold font-display tracking-widest">Pick a Colour</h3>
              <div className="grid grid-cols-2 gap-6">
                {(['red', 'blue', 'green', 'yellow'] as Color[]).map(c => (
                  <motion.button
                    key={c}
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.94 }}
                    onClick={() => handleColorSelect(c)}
                    className={`w-32 h-32 rounded-2xl shadow-xl font-display font-black text-xl tracking-widest
                      ${c === 'red'    ? 'bg-red-500 text-red-50' :
                        c === 'blue'   ? 'bg-blue-500 text-blue-50' :
                        c === 'green'  ? 'bg-green-500 text-green-50' :
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

      {/* ── Blank Wild Rule Picker ─────────────────────────────────────────── */}
      <AnimatePresence>
        {blankWildCardId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              className="bg-gradient-to-br from-purple-800 to-indigo-800 border border-purple-400/40
                         p-10 rounded-3xl shadow-2xl text-center max-w-sm w-full mx-4"
            >
              <Zap size={40} className="text-yellow-300 mx-auto mb-4" />
              <h3 className="text-3xl font-black mb-2 text-white font-display tracking-widest">Choose a Rule</h3>
              <p className="text-purple-200 mb-8 text-sm">Your special power!</p>
              <div className="flex flex-col gap-4">
                {[
                  { id: 'skip_all',      name: 'Skip All',      desc: 'Everyone skips once' },
                  { id: 'reverse_twice', name: 'Reverse Twice', desc: 'Reverse direction twice' },
                  { id: 'draw_two_all',  name: 'Draw Two All',  desc: 'Everyone draws 2 cards' },
                ].map(rule => (
                  <motion.button
                    key={rule.id}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => handleRuleSelect(rule.id)}
                    className="w-full px-6 py-5 rounded-2xl bg-white/15 hover:bg-white/25 transition-all
                               text-white font-bold border border-white/30 text-left"
                  >
                    <div className="text-lg">{rule.name}</div>
                    <div className="text-xs opacity-75 mt-0.5">{rule.desc}</div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Shuffle Hand Modal ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {shuffleCardId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              className="casino-panel border border-gold/30 p-10 rounded-3xl shadow-2xl
                         text-center max-w-lg w-full mx-4"
            >
              <ArrowLeftRight size={40} className="text-blue-400 mx-auto mb-4" />
              <h3 className="text-3xl font-black mb-8 text-white font-display tracking-widest">Shuffle Hands</h3>

              {!shuffleAction ? (
                <div className="flex flex-col gap-4">
                  <button
                    onClick={() => setShuffleAction('swap_with')}
                    className="casino-panel hover:border-gold/40 border border-gold/20
                               p-6 rounded-2xl text-white font-bold text-lg flex items-center justify-center gap-3 transition-all"
                  >
                    <User size={26} className="text-green-400" />
                    Swap my hand with someone
                  </button>
                  <button
                    onClick={() => setShuffleAction('swap_two')}
                    className="casino-panel hover:border-gold/40 border border-gold/20
                               p-6 rounded-2xl text-white font-bold text-lg flex items-center justify-center gap-3 transition-all"
                  >
                    <Users size={26} className="text-purple-400" />
                    Make two players swap
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  <p className="text-slate-300 font-medium text-lg">
                    {shuffleAction === 'swap_with'
                      ? 'Pick 1 player to swap your hand with:'
                      : 'Pick 2 players to swap hands:'}
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    {players
                      .filter(p => shuffleAction === 'swap_two' ? true : p.id !== myPlayerId)
                      .map(p => {
                        const sel = shuffleTargetIds.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            onClick={() => handleShuffleTargetSelect(p.id)}
                            className={`px-6 py-4 rounded-2xl font-bold transition-all border-2 text-sm
                              ${sel
                                ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-500/40'
                                : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700 hover:border-slate-500'}`}
                          >
                            {p.name}
                            <span className="block text-xs opacity-70 mt-0.5">{p.hand.length} cards</span>
                          </button>
                        );
                      })}
                  </div>
                  <div className="flex gap-4">
                    <button
                      onClick={() => { setShuffleAction(null); setShuffleTargetIds([]); }}
                      className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-4 rounded-2xl font-bold text-lg transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={confirmShuffle}
                      disabled={
                        (shuffleAction === 'swap_with' && shuffleTargetIds.length !== 1) ||
                        (shuffleAction === 'swap_two' && shuffleTargetIds.length !== 2)
                      }
                      className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed
                                 text-white py-4 rounded-2xl font-bold text-lg transition-colors"
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
