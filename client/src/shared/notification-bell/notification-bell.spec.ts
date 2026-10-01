import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { NotificationService } from '../../core/services/notification.service';
import { Notification } from '../../types/notification.types';
import { NotificationBell } from './notification-bell';

describe('NotificationBell', () => {
  let notificationService: {
    unreadCount: ReturnType<typeof signal<number>>;
    getMine: ReturnType<typeof vi.fn>;
    markAsRead: ReturnType<typeof vi.fn>;
    refreshUnreadCount: ReturnType<typeof vi.fn>;
    resetUnreadCount: ReturnType<typeof vi.fn>;
  };

  const unread: Notification = {
    id: 'n1',
    type: 'NewResponse',
    message: 'An agent responded to your ticket',
    ticketId: 't1',
    createdAtUtc: '2026-01-01T00:00:00Z',
    readAtUtc: null,
  };
  const read: Notification = { ...unread, id: 'n2', readAtUtc: '2026-01-02T00:00:00Z' };

  beforeEach(async () => {
    notificationService = {
      unreadCount: signal(0),
      getMine: vi.fn().mockReturnValue(of([unread, read])),
      markAsRead: vi.fn().mockReturnValue(of(undefined)),
      refreshUnreadCount: vi.fn(),
      resetUnreadCount: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [NotificationBell],
      providers: [provideRouter([]), { provide: NotificationService, useValue: notificationService }],
    }).compileComponents();
  });

  function createComponent() {
    const fixture = TestBed.createComponent(NotificationBell);
    fixture.detectChanges();
    return fixture;
  }

  it('does not fetch a preview until the dropdown opens', () => {
    createComponent();

    expect(notificationService.getMine).not.toHaveBeenCalled();
  });

  it('loads a preview of recent notifications when opened', () => {
    const fixture = createComponent();
    fixture.componentInstance.onOpenChange(true);

    expect(notificationService.getMine).toHaveBeenCalled();
    expect(fixture.componentInstance.preview()).toEqual([unread, read]);
    expect(fixture.componentInstance.loading()).toBe(false);
  });

  it('clears the unread badge count as soon as the dropdown opens', () => {
    const fixture = createComponent();
    fixture.componentInstance.onOpenChange(true);

    expect(notificationService.resetUnreadCount).toHaveBeenCalled();
  });

  it('does not clear the unread badge count when the dropdown closes', () => {
    const fixture = createComponent();
    fixture.componentInstance.onOpenChange(false);

    expect(notificationService.resetUnreadCount).not.toHaveBeenCalled();
  });

  it('does not reload the preview when the dropdown closes', () => {
    const fixture = createComponent();
    fixture.componentInstance.onOpenChange(false);

    expect(notificationService.getMine).not.toHaveBeenCalled();
    expect(fixture.componentInstance.preview()).toEqual([]);
  });

  it('stops loading if fetching the preview fails', () => {
    notificationService.getMine.mockReturnValue(throwError(() => new Error('boom')));
    const fixture = createComponent();
    fixture.componentInstance.onOpenChange(true);

    expect(fixture.componentInstance.loading()).toBe(false);
    expect(fixture.componentInstance.preview()).toEqual([]);
  });

  it('marks a notification as read and refreshes the unread count', () => {
    const fixture = createComponent();
    fixture.componentInstance.onOpenChange(true);
    fixture.componentInstance.markAsRead(unread);

    expect(notificationService.markAsRead).toHaveBeenCalledWith('n1');
    expect(notificationService.refreshUnreadCount).toHaveBeenCalled();
    expect(fixture.componentInstance.preview().find((n) => n.id === 'n1')?.readAtUtc).toBeTruthy();
  });

  it('does not re-mark an already-read notification', () => {
    const fixture = createComponent();
    fixture.componentInstance.markAsRead(read);

    expect(notificationService.markAsRead).not.toHaveBeenCalled();
  });

  it('reflects the unread count from the notification service', () => {
    notificationService.unreadCount.set(4);
    const fixture = createComponent();

    expect(fixture.componentInstance.unreadCount()).toBe(4);
  });
});
