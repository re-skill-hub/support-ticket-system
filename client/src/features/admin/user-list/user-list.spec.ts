import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
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
});
