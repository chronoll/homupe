
export const requestNotificationPermission = async (): Promise<NotificationPermission> => {
  if (!('Notification' in window)) {
    console.warn('This browser does not support desktop notification');
    return 'denied'; // Treat as denied if not supported
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  if (Notification.permission === 'denied') {
    return 'denied';
  }

  // Request permission
  const permission = await Notification.requestPermission();
  return permission;
};

export const showNotification = (title: string, options?: NotificationOptions): void => {
  if (!('Notification' in window)) {
    console.warn('Notifications not supported in this browser.');
    return;
  }

  if (Notification.permission === 'granted') {
    new Notification(title, options);
  } else {
    console.warn('Notification permission not granted.');
    // Fallback: Could show an in-app alert or log
  }
};
