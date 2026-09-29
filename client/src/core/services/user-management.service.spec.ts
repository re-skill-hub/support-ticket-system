import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { ManagedUser, PagedResult } from '../../types/user-management.types';
import { UserManagementService } from './user-management.service';

describe('UserManagementService', () => {
  let service: UserManagementService;
  let httpMock: HttpTestingController;
  const baseUrl = `${environment.ticketApiUrl}/users`;

  const user: ManagedUser = {
    id: 'u1',
    email: 'agent@example.test',
    fullName: 'Agent One',
    role: 'SupportAgent',
    isActive: true,
    createdAtUtc: '2026-01-01T00:00:00Z',
  };

  const pagedResult: PagedResult<ManagedUser> = {
    items: [user],
    page: 1,
    pageSize: 20,
    totalCount: 1,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(UserManagementService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('list() with no filters sends only page and pageSize as query params', () => {
    service.list().subscribe((res) => expect(res).toEqual(pagedResult));

    const req = httpMock.expectOne(
      (r) => r.url === baseUrl && r.params.get('page') === '1' && r.params.get('pageSize') === '20' && !r.params.has('role'),
    );
    expect(req.request.method).toBe('GET');
    req.flush(pagedResult);
  });

  it('list() with a role and page sends all three as query params', () => {
    service.list('SupportAgent', 2, 10).subscribe();

    const req = httpMock.expectOne(
      (r) =>
        r.url === baseUrl &&
        r.params.get('role') === 'SupportAgent' &&
        r.params.get('page') === '2' &&
        r.params.get('pageSize') === '10',
    );
    req.flush(pagedResult);
  });

  it('getById() gets /users/:id', () => {
    service.getById('u1').subscribe((res) => expect(res).toEqual(user));

    const req = httpMock.expectOne(`${baseUrl}/u1`);
    expect(req.request.method).toBe('GET');
    req.flush(user);
  });

  it('create() posts to /users', () => {
    const request = { email: user.email, password: 'Password-123!', fullName: user.fullName, role: user.role };
    service.create(request).subscribe((res) => expect(res).toEqual(user));

    const req = httpMock.expectOne(baseUrl);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush(user);
  });

  it('changeRole() puts to /users/:id/role', () => {
    service.changeRole('u1', { role: 'Admin' }).subscribe();

    const req = httpMock.expectOne(`${baseUrl}/u1/role`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ role: 'Admin' });
    req.flush({ ...user, role: 'Admin' });
  });

  it('setActive() patches /users/:id/status', () => {
    service.setActive('u1', { isActive: false }).subscribe();

    const req = httpMock.expectOne(`${baseUrl}/u1/status`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ isActive: false });
    req.flush({ ...user, isActive: false });
  });
});
