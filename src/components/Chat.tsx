import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '../context/GameContext';
import { MessageCircle, X, Send, Bell } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const Chat: React.FC = () => {
  const { chatMessages, sendMessage, myPlayerId } = useGame();
  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Array<{ id: string; message: string; senderName: string }>>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMessageCountRef = useRef(0);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [chatMessages, isOpen]);

  // Show notifications for new messages
  useEffect(() => {
    if (chatMessages.length > lastMessageCountRef.current) {
      const newMessage = chatMessages[chatMessages.length - 1];
      
      // Only show notification if message is from someone else
      if (newMessage.senderId !== myPlayerId && !isOpen) {
        const notificationId = Math.random().toString();
        setNotifications(prev => [...prev, {
          id: notificationId,
          message: newMessage.text,
          senderName: newMessage.senderName
        }]);

        // Auto-remove notification after 4 seconds
        setTimeout(() => {
          setNotifications(prev => prev.filter(n => n.id !== notificationId));
        }, 4000);

        // Increment unread count
        setUnreadCount(prev => prev + 1);
      }
      lastMessageCountRef.current = chatMessages.length;
    }
  }, [chatMessages, myPlayerId, isOpen]);

  // Reset unread count when opening chat
  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
    }
  }, [isOpen]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
      sendMessage(inputText.trim());
      setInputText('');
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-4">{/* Message Notifications */}
      <AnimatePresence>
        {notifications.map((notif) => (
          <motion.div
            key={notif.id}
            initial={{ opacity: 0, x: 100, y: -20 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, x: 100 }}
            className="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-6 py-4 rounded-2xl shadow-2xl max-w-xs"
          >
            <div className="flex items-start gap-3">
              <Bell size={20} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-sm">{notif.senderName}</p>
                <p className="text-sm opacity-90 line-clamp-2">{notif.message}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="w-96 h-96 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="p-4 bg-gradient-to-r from-violet-600 to-indigo-600 flex justify-between items-center text-white">
              <h3 className="font-bold flex items-center gap-2 text-lg">
                <MessageCircle size={20} /> Chat
              </h3>
              <button onClick={() => setIsOpen(false)} className="hover:bg-white/20 rounded-full p-1 transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
              {chatMessages.length === 0 ? (
                <p className="text-center text-slate-400 text-sm mt-4">No messages yet. Say hi!</p>
              ) : (
                chatMessages.map((msg) => {
                  const isMe = msg.senderId === myPlayerId;
                  return (
                    <motion.div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <div className={`px-4 py-2 rounded-2xl max-w-[85%] text-sm ${isMe ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none shadow-sm'}`}>
                        {msg.text}
                      </div>
                      <span className="text-[10px] text-slate-400 px-1 mt-1">{isMe ? 'You' : msg.senderName}</span>
                    </motion.div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSend} className="p-3 bg-white border-t border-slate-100 flex gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 px-4 py-2 bg-slate-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button type="submit" className="p-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200">
                <Send size={18} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className={`p-4 rounded-full shadow-lg transition-all duration-300 ${isOpen ? 'bg-indigo-600 text-white shadow-indigo-300' : 'bg-white text-indigo-600 hover:bg-indigo-50 border border-indigo-100'}`}
      >
        <MessageCircle size={28} />
        {!isOpen && unreadCount > 0 && (
           <motion.span
             animate={{ scale: [1, 1.2, 1] }}
             transition={{ duration: 0.5, repeat: Infinity }}
             className="absolute top-0 right-0 w-5 h-5 bg-red-500 border-2 border-white rounded-full text-white text-xs font-bold flex items-center justify-center"
           >
             {unreadCount}
           </motion.span>
        )}
      </motion.button>
    </div>
  );
};

export default Chat;
