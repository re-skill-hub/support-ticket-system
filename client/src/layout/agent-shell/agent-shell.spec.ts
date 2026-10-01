import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { AgentShell } from './agent-shell';

describe('AgentShell', () => {
  let authService: {
    isAdmin: ReturnType<typeof vi.fn>;
    isAuthenticated: ReturnType<typeof vi.fn>;
    currentUser: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
  };
  let notificationService: {
    unreadCount: ReturnType<typeof vi.fn>;
    refreshUnreadCount: ReturnType<typeof vi.fn>;
    resetUnreadCount: ReturnType<typeof vi.fn>;
  };

  function configure(isAdmin: boolean) {
    authService = {
      isAdmin: vi.fn().mockReturnValue(isAdmin),
      isAuthenticated: vi.fn().mockReturnValue(true),
      currentUser: vi.fn().mockReturnValue({ id: 'u1', email: 'a@example.test', fullName: 'A Gent', role: 'SupportAgent' }),
      logout: vi.fn().mockReturnValue(of(undefined)),
    };
    notificationService = {
      unreadCount: vi.fn().mockReturnValue(0),
      refreshUnreadCount: vi.fn(),
      resetUnreadCount: vi.fn(),
    };

    return TestBed.configureTestingModule({
      imports: [AgentShell],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthService, useValue: authService },
        { provide: NotificationService, useValue: notificationService },
      ],
    }).compileComponents();
  }

  function createComponent() {
    const fixture = TestBed.createComponent(AgentShell);
    fixture.detectChanges();
    return fixture;
  }

  it('shows the Manage Users nav link for an admin', async () => {
    await configure(true);
    const fixture = createComponent();

    const links = fixture.nativeElement.querySelectorAll('a[routerLink="/admin/users"]');
    expect(links.length).toBeGreaterThan(0);
  });

  it('hides the Manage Users nav link for a non-admin', async () => {
    await configure(false);
    const fixture = createComponent();

    const links = fixture.nativeElement.querySelectorAll('a[routerLink="/admin/users"]');
    expect(links.length).toBe(0);
  });

  it('resets unread count and logs out', async () => {
    await configure(false);
    const fixture = createComponent();
    const router = TestBed.inject(Router);
    const navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture.componentInstance.logout();

    expect(notificationService.resetUnreadCount).toHaveBeenCalled();
    expect(authService.logout).toHaveBeenCalled();
    expect(navigateByUrl).toHaveBeenCalledWith('/login');
  });

  afterEach(() => vi.useRealTimers());

  it('does not poll for unread notifications once not authenticated', async () => {
    await configure(false);
    authService.isAuthenticated.mockReturnValue(false);
    createComponent();

    expect(notificationService.refreshUnreadCount).not.toHaveBeenCalled();
  });

  it('stops polling for unread notifications once the shell is destroyed (e.g. on logout)', async () => {
    vi.useFakeTimers();
    await configure(false);
    const fixture = createComponent();
    expect(notificationService.refreshUnreadCount).toHaveBeenCalledTimes(1);

    fixture.destroy();
    await vi.advanceTimersByTimeAsync(60_000);

    // Without takeUntilDestroyed() this would keep firing every 30s forever, even after logout.
    expect(notificationService.refreshUnreadCount).toHaveBeenCalledTimes(1);
  });
});
