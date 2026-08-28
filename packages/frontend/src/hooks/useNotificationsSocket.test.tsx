import React from 'react';
import { render, screen, fireEvent, renderHook, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import {
  NOTIFICATION_EVENT,
  roomForUser,
  useNotificationsSocket,
  type AppNotification,
  type NotificationSocket,
} from './useNotificationsSocket';
import { NotificationBell } from '../components/NotificationBell';

const USER = 'user-1';

function notification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 'n1',
    type: 'call.backed',
    title: 'Someone backed your call',
    read: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function fakeSocket() {
  const handlers = new Map<string, ((payload: AppNotification) => void)[]>();
  const joined: string[] = [];
  let disconnected = false;

  const socket: NotificationSocket = {
    on: (event, handler) => handlers.set(event, [...(handlers.get(event) ?? []), handler]),
    off: (event, handler) => {
      const existing = handlers.get(event) ?? [];
      handlers.set(event, handler ? existing.filter((h) => h !== handler) : []);
    },
    emit: (event, ...args) => {
      if (event === 'join') joined.push(String(args[0]));
    },
    disconnect: () => {
      disconnected = true;
    },
  };

  return {
    socket,
    joined,
    get disconnected() {
      return disconnected;
    },
    push(payload: AppNotification) {
      for (const handler of handlers.get(NOTIFICATION_EVENT) ?? []) handler(payload);
    },
    handlerCount() {
      return (handlers.get(NOTIFICATION_EVENT) ?? []).length;
    },
  };
}

describe('roomForUser', () => {
  it('namespaces the room by user', () => {
    expect(roomForUser('abc')).toBe('user:abc');
  });
});

describe('useNotificationsSocket', () => {
  it('joins the user room', () => {
    const fake = fakeSocket();

    renderHook(() => useNotificationsSocket(USER, { socketFactory: () => fake.socket }));

    expect(fake.joined).toContain('user:user-1');
  });

  it('adds a pushed notification and counts it unread', async () => {
    const fake = fakeSocket();

    const { result } = renderHook(() =>
      useNotificationsSocket(USER, { socketFactory: () => fake.socket }),
    );

    act(() => fake.push(notification()));

    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    expect(result.current.unreadCount).toBe(1);
  });

  // Sockets redeliver on reconnect; appending blindly would show duplicates.
  it('replaces a redelivered notification rather than duplicating it', async () => {
    const fake = fakeSocket();

    const { result } = renderHook(() =>
      useNotificationsSocket(USER, { socketFactory: () => fake.socket }),
    );

    act(() => fake.push(notification({ title: 'first' })));
    act(() => fake.push(notification({ title: 'second' })));

    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    expect(result.current.notifications[0].title).toBe('second');
  });

  it('unsubscribes and disconnects on unmount', () => {
    const fake = fakeSocket();

    const { unmount } = renderHook(() =>
      useNotificationsSocket(USER, { socketFactory: () => fake.socket }),
    );

    expect(fake.handlerCount()).toBe(1);

    unmount();

    expect(fake.handlerCount()).toBe(0);
    expect(fake.disconnected).toBe(true);
  });

  it('seeds from the polling fallback when there is no socket', async () => {
    const fetchNotifications = vi.fn().mockResolvedValue([notification()]);

    const { result } = renderHook(() => useNotificationsSocket(USER, { fetchNotifications }));

    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    expect(result.current.isLoading).toBe(false);
  });

  // A notification pushed moments ago may not be in this poll's response yet;
  // replacing wholesale would make it flicker out of the list.
  it('merges a poll with socket-delivered notifications', async () => {
    const fake = fakeSocket();
    const fetchNotifications = vi.fn().mockResolvedValue([notification({ id: 'polled' })]);

    const { result } = renderHook(() =>
      useNotificationsSocket(USER, { socketFactory: () => fake.socket, fetchNotifications }),
    );

    await waitFor(() => expect(result.current.notifications).toHaveLength(1));

    act(() => fake.push(notification({ id: 'pushed' })));

    await waitFor(() => expect(result.current.notifications).toHaveLength(2));
  });

  it('reports a failing poll without clearing what it already has', async () => {
    const fake = fakeSocket();
    const fetchNotifications = vi.fn().mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() =>
      useNotificationsSocket(USER, { socketFactory: () => fake.socket, fetchNotifications }),
    );

    act(() => fake.push(notification()));

    await waitFor(() => expect(result.current.error?.message).toBe('offline'));
    expect(result.current.notifications).toHaveLength(1);
  });

  it('does nothing without a user', () => {
    const fetchNotifications = vi.fn();
    const fake = fakeSocket();

    renderHook(() =>
      useNotificationsSocket(undefined, { socketFactory: () => fake.socket, fetchNotifications }),
    );

    expect(fetchNotifications).not.toHaveBeenCalled();
    expect(fake.joined).toHaveLength(0);
  });

  describe('mark read and dismiss', () => {
    it('marks one as read and drops the unread count', async () => {
      const fake = fakeSocket();
      const markRead = vi.fn().mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useNotificationsSocket(USER, { socketFactory: () => fake.socket, markRead }),
      );

      act(() => fake.push(notification()));
      await waitFor(() => expect(result.current.unreadCount).toBe(1));

      act(() => result.current.markAsRead('n1'));

      await waitFor(() => expect(result.current.unreadCount).toBe(0));
      expect(markRead).toHaveBeenCalledWith(USER, 'n1');
    });

    it('reverts a mark-read that the server rejected', async () => {
      const fake = fakeSocket();
      const markRead = vi.fn().mockRejectedValue(new Error('nope'));

      const { result } = renderHook(() =>
        useNotificationsSocket(USER, { socketFactory: () => fake.socket, markRead }),
      );

      act(() => fake.push(notification()));
      await waitFor(() => expect(result.current.unreadCount).toBe(1));

      act(() => result.current.markAsRead('n1'));

      await waitFor(() => expect(result.current.error?.message).toBe('nope'));
      expect(result.current.unreadCount).toBe(1);
    });

    it('marks everything read at once', async () => {
      const fake = fakeSocket();

      const { result } = renderHook(() =>
        useNotificationsSocket(USER, { socketFactory: () => fake.socket }),
      );

      act(() => fake.push(notification({ id: 'a' })));
      act(() => fake.push(notification({ id: 'b' })));
      await waitFor(() => expect(result.current.unreadCount).toBe(2));

      act(() => result.current.markAllAsRead());

      await waitFor(() => expect(result.current.unreadCount).toBe(0));
    });

    it('dismisses a notification', async () => {
      const fake = fakeSocket();
      const remove = vi.fn().mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useNotificationsSocket(USER, { socketFactory: () => fake.socket, remove }),
      );

      act(() => fake.push(notification()));
      await waitFor(() => expect(result.current.notifications).toHaveLength(1));

      act(() => result.current.dismiss('n1'));

      await waitFor(() => expect(result.current.notifications).toHaveLength(0));
      expect(remove).toHaveBeenCalledWith(USER, 'n1');
    });

    // A delete that failed has not happened; silently dropping it would lose
    // a notification the user never dismissed.
    it('restores a dismissal the server rejected', async () => {
      const fake = fakeSocket();
      const remove = vi.fn().mockRejectedValue(new Error('nope'));

      const { result } = renderHook(() =>
        useNotificationsSocket(USER, { socketFactory: () => fake.socket, remove }),
      );

      act(() => fake.push(notification()));
      await waitFor(() => expect(result.current.notifications).toHaveLength(1));

      act(() => result.current.dismiss('n1'));

      await waitFor(() => expect(result.current.error?.message).toBe('nope'));
      expect(result.current.notifications).toHaveLength(1);
    });
  });
});

describe('NotificationBell', () => {
  it('shows no badge when everything is read', async () => {
    render(<NotificationBell userId={USER} fetchNotifications={async () => []} />);

    await waitFor(() => expect(screen.queryByTestId('notification-badge')).not.toBeInTheDocument());
  });

  it('badges the unread count', async () => {
    render(
      <NotificationBell
        userId={USER}
        fetchNotifications={async () => [notification({ id: 'a' }), notification({ id: 'b' })]}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('notification-badge')).toHaveTextContent('2'));
  });

  // A four-digit badge breaks the layout, and the difference between 99 and
  // 4,312 unread is not information anyone acts on.
  it('caps the badge', async () => {
    const many = Array.from({ length: 150 }, (_, index) => notification({ id: `n${index}` }));

    render(<NotificationBell userId={USER} maxBadgeCount={99} fetchNotifications={async () => many} />);

    await waitFor(() => expect(screen.getByTestId('notification-badge')).toHaveTextContent('99+'));
  });

  it('announces the unread count to assistive technology', async () => {
    render(<NotificationBell userId={USER} fetchNotifications={async () => [notification()]} />);

    await waitFor(() =>
      expect(screen.getByTestId('notification-bell-button')).toHaveAttribute(
        'aria-label',
        'Notifications, 1 unread',
      ),
    );
  });

  it('opens and closes the dropdown', async () => {
    render(<NotificationBell userId={USER} fetchNotifications={async () => [notification()]} />);

    expect(screen.queryByTestId('notification-dropdown')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('notification-bell-button'));
    expect(screen.getByTestId('notification-dropdown')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('notification-bell-button'));
    expect(screen.queryByTestId('notification-dropdown')).not.toBeInTheDocument();
  });

  it('lists notifications and marks one read on open', async () => {
    render(<NotificationBell userId={USER} fetchNotifications={async () => [notification()]} />);

    fireEvent.click(screen.getByTestId('notification-bell-button'));

    await waitFor(() => expect(screen.getByTestId('notification-n1')).toBeInTheDocument());
    expect(screen.getByTestId('notification-n1')).toHaveAttribute('data-read', 'false');

    fireEvent.click(screen.getByTestId('notification-open-n1'));

    await waitFor(() =>
      expect(screen.getByTestId('notification-n1')).toHaveAttribute('data-read', 'true'),
    );
  });

  it('dismisses a notification from the list', async () => {
    render(<NotificationBell userId={USER} fetchNotifications={async () => [notification()]} />);

    fireEvent.click(screen.getByTestId('notification-bell-button'));
    await waitFor(() => expect(screen.getByTestId('notification-n1')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('notification-dismiss-n1'));

    await waitFor(() => expect(screen.queryByTestId('notification-n1')).not.toBeInTheDocument());
  });

  it('shows an empty state once loaded', async () => {
    render(<NotificationBell userId={USER} fetchNotifications={async () => []} />);

    fireEvent.click(screen.getByTestId('notification-bell-button'));

    await waitFor(() => expect(screen.getByTestId('notification-empty')).toBeInTheDocument());
  });
});
