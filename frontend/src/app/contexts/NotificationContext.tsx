import React, { createContext, useContext, useState, ReactNode } from 'react';

export type NotificationType = 'alert' | 'success' | 'system' | 'verification';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  time: string;
  read: boolean;
  farmId?: string;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Omit<Notification, 'id' | 'read' | 'time'>) => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
  removeNotification: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const initialMockNotifications: Notification[] = [
  {
    id: 'n1',
    type: 'verification',
    title: 'Verification Failed',
    message: 'Anomaly detected on Farm #402. Maize yield estimate deviates >20% from declaration.',
    time: '2 mins ago',
    read: false,
    farmId: '#402'
  },
  {
    id: 'n2',
    type: 'alert',
    title: 'Moisture Alert',
    message: 'Soil moisture critically low across Sector 4 northern blocks. Irrigation recommended.',
    time: '45 mins ago',
    read: false,
    farmId: 'Sec-4'
  },
  {
    id: 'n3',
    type: 'success',
    title: 'Offline Sync Complete',
    message: '12 new offline records and field notes synced successfully with the main database.',
    time: '2 hours ago',
    read: true
  },
  {
    id: 'n4',
    type: 'system',
    title: 'Satellite Imagery Updated',
    message: 'High-resolution Sentinel-2 multispectral imagery is now available for your monitoring regions.',
    time: '1 day ago',
    read: true
  }
];

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>(initialMockNotifications);

  const unreadCount = notifications.filter(n => !n.read).length;

  const addNotification = (notification: Omit<Notification, 'id' | 'read' | 'time'>) => {
    const newNotification: Notification = {
      ...notification,
      id: `n-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      read: false,
      time: 'Just now'
    };
    setNotifications(prev => [newNotification, ...prev]);
  };

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const markRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      addNotification,
      markAllRead,
      markRead,
      removeNotification
    }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
