import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Bell, 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  Map as MapIcon, 
  ShieldAlert,
  Clock
} from 'lucide-react';
import { useNotifications, Notification, NotificationType } from '../../contexts/NotificationContext';

export const NotificationsPanel: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onMapFocus?: (farmId: string) => void;
}> = ({ isOpen, onClose, onMapFocus }) => {
  const { 
    notifications, 
    unreadCount, 
    markAllRead, 
    markRead, 
    removeNotification 
  } = useNotifications();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const handleRemove = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeNotification(id);
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markRead(notification.id);
    }
    if (notification.farmId && onMapFocus) {
      onMapFocus(notification.farmId);
      onClose();
    }
  };

  const getIcon = (type: NotificationType) => {
    switch (type) {
      case 'alert': return <AlertTriangle className="text-amber-500" size={18} />;
      case 'success': return <CheckCircle2 className="text-emerald-500" size={18} />;
      case 'system': return <MapIcon className="text-blue-400" size={18} />;
      case 'verification': return <ShieldAlert className="text-red-500" size={18} />;
    }
  };

  const content = (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          key="notification-container" 
          className="fixed inset-0 z-[9999] pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Overlay to catch clicks and close the panel */}
          <div 
            className="absolute inset-0 pointer-events-auto" 
            onClick={onClose} 
          />
          <motion.div
            key="panel-content"
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute right-4 md:right-16 top-16 w-[calc(100vw-2rem)] sm:w-96 bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.8)] overflow-hidden pointer-events-auto text-left cursor-default flex flex-col"
          >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-white/90">Intelligence Alerts</h3>
              {unreadCount > 0 && (
                <span className="bg-green-500/20 text-green-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-green-500/20">
                  {unreadCount} NEW
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={markAllRead}
                className="text-[11px] text-white/50 hover:text-white transition-colors"
                disabled={unreadCount === 0}
              >
                Mark all read
              </button>
              <button onClick={onClose} className="text-white/50 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors">
                <X size={14} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[400px] overflow-y-auto overflow-x-hidden custom-scrollbar">
            {notifications.length === 0 ? (
              <div className="py-12 px-4 text-center flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
                  <Bell className="text-white/20" size={24} />
                </div>
                <p className="text-white/50 text-sm">No new intelligence alerts</p>
                <p className="text-white/30 text-xs mt-1">You are all caught up</p>
              </div>
            ) : (
              <div className="flex flex-col">
                <AnimatePresence initial={false}>
                  {notifications.map((notification) => (
                    <motion.div
                      key={notification.id}
                      layout
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      onClick={() => handleNotificationClick(notification)}
                      className={`
                        group relative flex gap-3 p-4 border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer
                        ${!notification.read ? 'bg-white/[0.03]' : ''}
                      `}
                    >
                      {/* Unread Indicator */}
                      {!notification.read && (
                        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-green-500 rounded-r-full" />
                      )}

                      {/* Icon */}
                      <div className={`
                        flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center
                        ${notification.type === 'alert' ? 'bg-amber-500/10' : ''}
                        ${notification.type === 'success' ? 'bg-emerald-500/10' : ''}
                        ${notification.type === 'system' ? 'bg-blue-500/10' : ''}
                        ${notification.type === 'verification' ? 'bg-red-500/10' : ''}
                      `}>
                        {getIcon(notification.type)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm font-medium truncate ${!notification.read ? 'text-white/90' : 'text-white/70'}`}>
                            {notification.title}
                          </p>
                          <span className="flex items-center gap-1 text-[10px] text-white/40 whitespace-nowrap mt-0.5">
                            <Clock size={10} />
                            {notification.time}
                          </span>
                        </div>
                        <p className={`text-xs mt-1 line-clamp-2 ${!notification.read ? 'text-white/70' : 'text-white/50'}`}>
                          {notification.message}
                        </p>
                        
                        {/* Action if applies */}
                        {notification.farmId && (
                          <div className="mt-2 flex items-center">
                            <span className="text-[10px] font-medium text-green-400 hover:text-green-300 flex items-center gap-1 bg-green-500/10 px-2 py-0.5 rounded-sm transition-colors">
                              <MapIcon size={10} />
                              Focus on {notification.farmId}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Delete button (shows on hover) */}
                      <button 
                        onClick={(e) => handleRemove(notification.id, e)}
                        className="opacity-0 group-hover:opacity-100 absolute right-2 top-2 p-1.5 text-white/30 hover:text-red-400 hover:bg-white/10 rounded-md transition-all"
                      >
                        <X size={14} />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
          
          {/* Footer */}
          {notifications.length > 0 && (
            <div className="p-2 border-t border-white/5 bg-black/40 text-center pointer-events-auto">
               <button 
                onClick={() => {
                  onClose();
                  if (onMapFocus) {
                    onMapFocus('history');
                  }
                }}
                className="text-xs text-white/50 hover:text-white transition-colors"
               >
                  View all intelligence history
               </button>
            </div>
          )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (!mounted) return null;
  return createPortal(content, document.body);
};
