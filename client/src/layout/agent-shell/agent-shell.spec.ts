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
});
