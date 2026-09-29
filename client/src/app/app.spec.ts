import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../core/services/auth.service';
import { NotificationService } from '../core/services/notification.service';
import { App } from './app';

describe('App', () => {
  let authService: {
    isStaff: ReturnType<typeof vi.fn>;
    isAuthenticated: ReturnType<typeof vi.fn>;
    isCustomer: ReturnType<typeof vi.fn>;
    isAdmin: ReturnType<typeof vi.fn>;
    currentUser: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
  };
  let notificationService: {
    unreadCount: ReturnType<typeof vi.fn>;
    refreshUnreadCount: ReturnType<typeof vi.fn>;
    resetUnreadCount: ReturnType<typeof vi.fn>;
  };

  function configure(role: 'Customer' | 'SupportAgent' | 'Admin') {
    authService = {
      isStaff: vi.fn().mockReturnValue(role === 'SupportAgent' || role === 'Admin'),
      isAuthenticated: vi.fn().mockReturnValue(true),
      isCustomer: vi.fn().mockReturnValue(role === 'Customer'),
      isAdmin: vi.fn().mockReturnValue(role === 'Admin'),
      currentUser: vi.fn().mockReturnValue({ id: 'u1', email: 'a@example.test', fullName: 'A User', role }),
      logout: vi.fn().mockReturnValue(of(undefined)),
    };
    notificationService = {
      unreadCount: vi.fn().mockReturnValue(0),
      refreshUnreadCount: vi.fn(),
      resetUnreadCount: vi.fn(),
    };

    return TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideHttpClient(),
        provideRouter([]),
        { provide: AuthService, useValue: authService },
        { provide: NotificationService, useValue: notificationService },
      ],
    }).compileComponents();
  }

  it('should create the app', async () => {
    await configure('Customer');
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('renders the customer nav shell for a Customer', async () => {
    await configure('Customer');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-nav')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-agent-shell')).toBeFalsy();
  });

  it('renders the agent shell for a SupportAgent', async () => {
    await configure('SupportAgent');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-agent-shell')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-nav')).toBeFalsy();
  });

  it('renders the agent shell for an Admin', async () => {
    await configure('Admin');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-agent-shell')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-nav')).toBeFalsy();
  });
});
