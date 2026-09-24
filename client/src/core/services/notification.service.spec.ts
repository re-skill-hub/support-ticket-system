import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { Notification } from '../../types/notification.types';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService;
  let httpMock: HttpTestingController;
  const baseUrl = `${environment.notificationApiUrl}/notifications`;

  const unread: Notification = {
    id: 'n1',
    type: 'NewResponse',
    message: 'An agent responded to your ticket',
    ticketId: 't1',
    createdAtUtc: '2026-01-01T00:00:00Z',
    readAtUtc: null,
  };
  const read: Notification = { ...unread, id: 'n2', readAtUtc: '2026-01-02T00:00:00Z' };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(NotificationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('starts with unreadCount 0', () => {
    expect(service.unreadCount()).toBe(0);
  });

  it('getMine() gets /notifications/mine', () => {
    service.getMine().subscribe((res) => expect(res).toEqual([unread, read]));

    const req = httpMock.expectOne(`${baseUrl}/mine`);
    expect(req.request.method).toBe('GET');
    req.flush([unread, read]);
  });

  it('markAsRead() patches /notifications/:id/read', () => {
    service.markAsRead('n1').subscribe();

    const req = httpMock.expectOne(`${baseUrl}/n1/read`);
    expect(req.request.method).toBe('PATCH');
    req.flush(null);
  });

  it('refreshUnreadCount() sets unreadCount to number of unread notifications', () => {
    service.refreshUnreadCount();

    httpMock.expectOne(`${baseUrl}/mine`).flush([unread, read]);

    expect(service.unreadCount()).toBe(1);
  });

  it('refreshUnreadCount() leaves unreadCount unchanged on error', () => {
    service.unreadCount.set(3);
    service.refreshUnreadCount();

    httpMock.expectOne(`${baseUrl}/mine`).flush(null, { status: 500, statusText: 'Server Error' });

    expect(service.unreadCount()).toBe(3);
  });

  it('resetUnreadCount() sets unreadCount to 0', () => {
    service.unreadCount.set(5);
    service.resetUnreadCount();
    expect(service.unreadCount()).toBe(0);
  });
});
