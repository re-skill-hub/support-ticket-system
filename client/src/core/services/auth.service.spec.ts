import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { AuthResponse } from '../../types/auth.types';
import { SILENT_AUTH_CHECK } from '../interceptors/error.interceptor';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  const baseUrl = `${environment.ticketApiUrl}/auth`;

  const authResponse: AuthResponse = {
    email: 'customer1@support.local',
    fullName: 'Cust Omer',
    role: 'Customer',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('starts unauthenticated', () => {
    expect(service.isAuthenticated()).toBe(false);
    expect(service.currentUser()).toBeNull();
  });

  it('sets currentUser and isAuthenticated on successful login', () => {
    service.login({ email: authResponse.email, password: 'secret' }).subscribe();

    const req = httpMock.expectOne(`${baseUrl}/login`);
    expect(req.request.method).toBe('POST');
    req.flush(authResponse);

    expect(service.isAuthenticated()).toBe(true);
    expect(service.currentUser()).toEqual({
      email: authResponse.email,
      fullName: authResponse.fullName,
      role: authResponse.role,
    });
    expect(service.isCustomer()).toBe(true);
    expect(service.isAgent()).toBe(false);
  });

  it('sets currentUser on successful register', () => {
    service.register({ email: authResponse.email, password: 'secret', fullName: authResponse.fullName }).subscribe();

    const req = httpMock.expectOne(`${baseUrl}/register`);
    expect(req.request.method).toBe('POST');
    req.flush(authResponse);

    expect(service.isAuthenticated()).toBe(true);
  });

  it('flags SupportAgent role correctly', () => {
    service.login({ email: 'agent@support.local', password: 'secret' }).subscribe();

    httpMock.expectOne(`${baseUrl}/login`).flush({ ...authResponse, role: 'SupportAgent' });

    expect(service.isAgent()).toBe(true);
    expect(service.isCustomer()).toBe(false);
  });

  it('clears currentUser on logout', () => {
    service.login({ email: authResponse.email, password: 'secret' }).subscribe();
    httpMock.expectOne(`${baseUrl}/login`).flush(authResponse);
    expect(service.isAuthenticated()).toBe(true);

    let logoutCompleted = false;
    service.logout().subscribe(() => (logoutCompleted = true));
    httpMock.expectOne(`${baseUrl}/logout`).flush(null);

    expect(logoutCompleted).toBe(true);
    expect(service.isAuthenticated()).toBe(false);
    expect(service.currentUser()).toBeNull();
  });

  it('initialize() rehydrates currentUser from /me on success', async () => {
    const promise = service.initialize();

    const req = httpMock.expectOne(`${baseUrl}/me`);
    req.flush(authResponse);

    await promise;
    expect(service.isAuthenticated()).toBe(true);
    expect(service.currentUser()?.email).toBe(authResponse.email);
  });

  it('initialize() leaves currentUser null when /me fails (no session cookie)', async () => {
    const promise = service.initialize();

    httpMock.expectOne(`${baseUrl}/me`).flush(null, { status: 401, statusText: 'Unauthorized' });

    await promise;
    expect(service.isAuthenticated()).toBe(false);
    expect(service.currentUser()).toBeNull();
  });

  it('initialize() marks /me as a silent auth check so a 401 does not trigger the global error toast', () => {
    const promise = service.initialize();

    const req = httpMock.expectOne(`${baseUrl}/me`);
    expect(req.request.context.get(SILENT_AUTH_CHECK)).toBe(true);

    req.flush(null, { status: 401, statusText: 'Unauthorized' });
    return promise;
  });
});
