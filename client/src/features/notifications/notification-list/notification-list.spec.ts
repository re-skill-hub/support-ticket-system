import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { NotificationService } from '../../../core/services/notification.service';
import { Notification } from '../../../types/notification.types';
import { NotificationList } from './notification-list';

describe('NotificationList', () => {
  let notificationService: { getMine: ReturnType<typeof vi.fn>; markAsRead: ReturnType<typeof vi.fn> };

  const initialNotifications: Notification[] = [];
  const updatedNotifications: Notification[] = [
    {
      id: 'notification-1',
      type: 'StatusChanged',
      message: 'Your ticket status changed to InProgress.',
      ticketId: 'ticket-1',
      createdAtUtc: '2026-09-28T12:00:00Z',
      readAtUtc: null,
    },
  ];

  beforeEach(async () => {
    notificationService = {
      getMine: vi.fn().mockReturnValue(of(initialNotifications)),
      markAsRead: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [NotificationList],
      providers: [provideRouter([]), { provide: NotificationService, useValue: notificationService }],
    }).compileComponents();
  });

  afterEach(() => vi.useRealTimers());

  it('refreshes notifications while the list remains open', async () => {
    vi.useFakeTimers();
    notificationService.getMine
      .mockReturnValueOnce(of(initialNotifications))
      .mockReturnValueOnce(of(updatedNotifications));

    const fixture = TestBed.createComponent(NotificationList);
    fixture.detectChanges();
    expect(fixture.componentInstance.notifications()).toEqual(initialNotifications);

    await vi.advanceTimersByTimeAsync(10_000);

    expect(notificationService.getMine).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.notifications()).toEqual(updatedNotifications);
    fixture.destroy();
  });
});