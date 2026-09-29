import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { UserManagementService } from '../../../core/services/user-management.service';
import { ManagedUser, PagedResult } from '../../../types/user-management.types';
import { UserList } from './user-list';

describe('UserList', () => {
  let userManagementService: {
    list: ReturnType<typeof vi.fn>;
    changeRole: ReturnType<typeof vi.fn>;
    setActive: ReturnType<typeof vi.fn>;
  };

  const users: ManagedUser[] = [
    {
      id: 'u1',
      email: 'customer@example.test',
      fullName: 'Cust One',
      role: 'Customer',
      isActive: true,
      createdAtUtc: '2026-01-01T00:00:00Z',
    },
    {
      id: 'u2',
      email: 'agent@example.test',
      fullName: 'Agent One',
      role: 'SupportAgent',
      isActive: true,
      createdAtUtc: '2026-01-02T00:00:00Z',
    },
  ];

  const pagedResult: PagedResult<ManagedUser> = { items: users, page: 1, pageSize: 20, totalCount: 2 };

  beforeEach(async () => {
    userManagementService = {
      list: vi.fn().mockReturnValue(of(pagedResult)),
      changeRole: vi.fn().mockReturnValue(of(users[0])),
      setActive: vi.fn().mockReturnValue(of(users[0])),
    };

    await TestBed.configureTestingModule({
      imports: [UserList],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: UserManagementService, useValue: userManagementService },
        { provide: AuthService, useValue: { currentUser: () => ({ id: 'u1', role: 'Admin' }) } },
      ],
    }).compileComponents();
  });

  function createComponent() {
    const fixture = TestBed.createComponent(UserList);
    fixture.detectChanges();
    return fixture;
  }

  it('loads users with no role filter on init', () => {
    const fixture = createComponent();

    expect(userManagementService.list).toHaveBeenCalledWith(undefined, 1, 20);
    expect(fixture.componentInstance.users()).toEqual(users);
    expect(fixture.componentInstance.totalCount()).toBe(2);
  });

  it('reloads with the selected role filter and resets to page 1', () => {
    const fixture = createComponent();
    userManagementService.list.mockClear();

    fixture.componentInstance.onRoleFilterChange('SupportAgent');

    expect(userManagementService.list).toHaveBeenCalledWith('SupportAgent', 1, 20);
  });

  it('identifies the current user row as self', () => {
    const fixture = createComponent();

    expect(fixture.componentInstance.isSelf(users[0])).toBe(true);
    expect(fixture.componentInstance.isSelf(users[1])).toBe(false);
  });

  it('does not call changeRole when acting on own row', () => {
    const fixture = createComponent();

    fixture.componentInstance.changeRole(users[0], 'Admin');

    expect(userManagementService.changeRole).not.toHaveBeenCalled();
  });

  it('calls changeRole and reloads when changing another user role', () => {
    const fixture = createComponent();
    userManagementService.list.mockClear();

    fixture.componentInstance.changeRole(users[1], 'Admin');

    expect(userManagementService.changeRole).toHaveBeenCalledWith('u2', { role: 'Admin' });
    expect(userManagementService.list).toHaveBeenCalled();
  });

  it('does not call setActive when acting on own row', () => {
    const fixture = createComponent();

    fixture.componentInstance.toggleActive(users[0]);

    expect(userManagementService.setActive).not.toHaveBeenCalled();
  });

  it('calls setActive and reloads when toggling another user status', () => {
    const fixture = createComponent();
    userManagementService.list.mockClear();

    fixture.componentInstance.toggleActive(users[1]);

    expect(userManagementService.setActive).toHaveBeenCalledWith('u2', { isActive: false });
    expect(userManagementService.list).toHaveBeenCalled();
  });

  it('reloads from the server when changeRole fails, instead of leaving a stale row', () => {
    userManagementService.changeRole.mockReturnValue(throwError(() => new Error('boom')));
    const fixture = createComponent();
    userManagementService.list.mockClear();

    fixture.componentInstance.changeRole(users[1], 'Admin');

    expect(userManagementService.list).toHaveBeenCalled();
  });

  it('reloads from the server when toggleActive fails, instead of leaving a stale row', () => {
    userManagementService.setActive.mockReturnValue(throwError(() => new Error('boom')));
    const fixture = createComponent();
    userManagementService.list.mockClear();

    fixture.componentInstance.toggleActive(users[1]);

    expect(userManagementService.list).toHaveBeenCalled();
  });

  it('sets loadError and stops loading when the initial load fails', () => {
    userManagementService.list.mockReturnValue(throwError(() => new Error('boom')));

    const fixture = createComponent();

    expect(fixture.componentInstance.loadError()).toBe(true);
    expect(fixture.componentInstance.loading()).toBe(false);
  });

  it('does not show loadError alongside a successful empty result', () => {
    userManagementService.list.mockReturnValue(of({ items: [], page: 1, pageSize: 20, totalCount: 0 }));

    const fixture = createComponent();

    expect(fixture.componentInstance.loadError()).toBe(false);
    expect(fixture.componentInstance.users()).toEqual([]);
  });

  it('clears loadError and reloads users when retry succeeds after a failure', () => {
    userManagementService.list.mockReturnValueOnce(throwError(() => new Error('boom')));
    const fixture = createComponent();
    expect(fixture.componentInstance.loadError()).toBe(true);

    userManagementService.list.mockReturnValue(of(pagedResult));
    fixture.componentInstance.retry();

    expect(fixture.componentInstance.loadError()).toBe(false);
    expect(fixture.componentInstance.users()).toEqual(users);
  });

  it('renders the self row role select and status button as disabled, but not other rows', () => {
    const fixture = createComponent();
    const rows = fixture.nativeElement.querySelectorAll('tbody tr');

    const selfRoleSelect = rows[0].querySelector('select.role-select') as HTMLSelectElement;
    const selfStatusButton = rows[0].querySelector('button') as HTMLButtonElement;
    const otherRoleSelect = rows[1].querySelector('select.role-select') as HTMLSelectElement;
    const otherStatusButton = rows[1].querySelector('button') as HTMLButtonElement;

    expect(selfRoleSelect.disabled).toBe(true);
    expect(selfStatusButton.disabled).toBe(true);
    expect(otherRoleSelect.disabled).toBe(false);
    expect(otherStatusButton.disabled).toBe(false);
  });

  it('changes page and reloads with the new page number', () => {
    const fixture = createComponent();
    userManagementService.list.mockClear();

    fixture.componentInstance.onPageChange(2);

    expect(fixture.componentInstance.page()).toBe(2);
    expect(userManagementService.list).toHaveBeenCalledWith(undefined, 2, 20);
  });
});
