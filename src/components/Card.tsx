import React from 'react';
import { Card as CardType, Color } from '../utils/gameLogic';
import { Ban, RefreshCcw, Plus } from 'lucide-react';
import { motion } from 'framer-motion';

interface CardProps {
  card: CardType;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}

const colorMap: Record<Color, string> = {
  red: 'bg-red-500',
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  yellow: 'bg-yellow-400',
  black: 'bg-slate-800' // Base for wild, will use gradient overlay
};

const CardComponent: React.FC<CardProps> = ({ card, onClick, className = '', disabled = false }) => {
  const isWild = card.color === 'black';
  const baseColor = colorMap[card.color];

  const renderContent = () => {
    switch (card.value) {
      case 'skip':
        return <Ban className="w-8 h-8 md:w-12 md:h-12 text-white" />;
      case 'reverse':
        return <RefreshCcw className="w-8 h-8 md:w-12 md:h-12 text-white" />;
      case 'draw2':
        return (
            <div className="flex flex-col items-center leading-none text-white font-bold drop-shadow-md">
                <Plus className="w-6 h-6 md:w-8 md:h-8 -mb-2" />
                <span className="text-3xl md:text-5xl">2</span>
            </div>
        );
      case 'wild':
        return (
          <div className="w-full h-full flex items-center justify-center">
             <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-red-500 via-yellow-400 to-blue-500 border-4 border-white shadow-inner" />
          </div>
        );
      case 'wild4':
        return (
            <div className="relative w-full h-full flex items-center justify-center">
                <div className="absolute inset-0 bg-gradient-to-br from-red-500 via-green-500 to-blue-500 opacity-50 rounded-xl" />
                <div className="z-10 flex flex-col items-center leading-none text-white font-bold drop-shadow-md">
                    <Plus className="w-6 h-6 md:w-8 md:h-8 -mb-2" />
                    <span className="text-3xl md:text-5xl">4</span>
                </div>
            </div>
        );
      default:
        return <span className="text-4xl md:text-6xl font-bold text-white drop-shadow-md" style={{ textShadow: '2px 2px 0px rgba(0,0,0,0.2)' }}>{card.value}</span>;
    }
  };

  return (
    <motion.div
      whileHover={!disabled ? { scale: 1.1, y: -10, zIndex: 10 } : {}}
      whileTap={!disabled ? { scale: 0.95 } : {}}
      onClick={() => !disabled && onClick?.()}
      className={`
        relative aspect-[2/3] w-24 md:w-32 rounded-xl shadow-xl border-4 border-white select-none cursor-pointer overflow-hidden
        ${baseColor}
        ${disabled ? 'opacity-50 cursor-not-allowed grayscale' : ''}
        ${className}
      `}
    >
      {isWild && (
        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-black/20" />
      )}
      
      {/* Center Content */}
      <div className="absolute inset-0 flex items-center justify-center">
        {renderContent()}
      </div>

      {/* Small Corner Indicators */}
      <div className="absolute top-2 left-2 text-white font-bold text-sm md:text-lg opacity-90 drop-shadow-sm">
         {card.value === 'skip' ? <Ban size={16} /> : card.value === 'reverse' ? <RefreshCcw size={16} /> : card.value === 'wild' ? 'W' : card.value === 'wild4' ? '+4' : card.value === 'draw2' ? '+2' : card.value}
      </div>
      <div className="absolute bottom-2 right-2 text-white font-bold text-sm md:text-lg opacity-90 drop-shadow-sm rotate-180">
         {card.value === 'skip' ? <Ban size={16} /> : card.value === 'reverse' ? <RefreshCcw size={16} /> : card.value === 'wild' ? 'W' : card.value === 'wild4' ? '+4' : card.value === 'draw2' ? '+2' : card.value}
      </div>
      
      {/* Uno logo oval in background (subtle) */}
      <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
          <div className="w-[80%] h-[60%] bg-white rounded-[50%] transform -rotate-45 mix-blend-overlay" />
      </div>
    </motion.div>
  );
};

export default CardComponent;
