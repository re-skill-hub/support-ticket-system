import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { of, throwError } from 'rxjs';
import { UserManagementService } from '../../../../core/services/user-management.service';
import { ManagedUser } from '../../../../types/user-management.types';
import { NewUserModal } from './new-user-modal';

describe('NewUserModal', () => {
  let userManagementService: { create: ReturnType<typeof vi.fn> };
  let activeModal: { close: ReturnType<typeof vi.fn>; dismiss: ReturnType<typeof vi.fn> };

  const createdUser: ManagedUser = {
    id: 'u1',
    email: 'new@example.test',
    fullName: 'New User',
    role: 'Customer',
    isActive: true,
    createdAtUtc: '2026-01-01T00:00:00Z',
  };

  beforeEach(async () => {
    userManagementService = { create: vi.fn().mockReturnValue(of(createdUser)) };
    activeModal = { close: vi.fn(), dismiss: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [NewUserModal],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: UserManagementService, useValue: userManagementService },
        { provide: NgbActiveModal, useValue: activeModal },
      ],
    }).compileComponents();
  });

  function createComponent() {
    const fixture = TestBed.createComponent(NewUserModal);
    fixture.detectChanges();
    return fixture;
  }

  function fillValidForm(fixture: ReturnType<typeof createComponent>) {
    fixture.componentInstance.form.setValue({
      email: 'new@example.test',
      password: 'Password123!',
      fullName: 'New User',
      role: 'Customer',
    });
  }

  it('submits the form and closes the modal with the created user', () => {
    const fixture = createComponent();
    fillValidForm(fixture);

    fixture.componentInstance.submit();

    expect(userManagementService.create).toHaveBeenCalledWith({
      email: 'new@example.test',
      password: 'Password123!',
      fullName: 'New User',
      role: 'Customer',
    });
    expect(activeModal.close).toHaveBeenCalledWith(createdUser);
  });

  it('rejects a password missing a symbol, matching the backend Identity policy', () => {
    const fixture = createComponent();
    fixture.componentInstance.form.controls.password.setValue('Password123');

    expect(fixture.componentInstance.form.controls.password.errors?.['requiresNonAlphanumeric']).toBe(true);
  });

  it('dismisses the modal on cancel', () => {
    const fixture = createComponent();

    fixture.componentInstance.cancel();

    expect(activeModal.dismiss).toHaveBeenCalled();
  });

  it('does not submit an invalid form', () => {
    const fixture = createComponent();

    fixture.componentInstance.submit();

    expect(userManagementService.create).not.toHaveBeenCalled();
  });

  it('rejects a full name longer than 200 characters', () => {
    const fixture = createComponent();
    fixture.componentInstance.form.controls.fullName.setValue('a'.repeat(201));

    expect(fixture.componentInstance.form.controls.fullName.errors?.['maxlength']).toBeTruthy();
  });

  it('accepts a full name of exactly 200 characters', () => {
    const fixture = createComponent();
    fixture.componentInstance.form.controls.fullName.setValue('a'.repeat(200));

    expect(fixture.componentInstance.form.controls.fullName.errors?.['maxlength']).toBeFalsy();
  });

  it('shows is-invalid on a touched, invalid field', () => {
    const fixture = createComponent();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('#new-user-email');

    fixture.componentInstance.form.controls.email.markAsTouched();
    fixture.detectChanges();

    expect(input.classList.contains('is-invalid')).toBe(true);
  });

  it('surfaces a bare string-array error body', () => {
    userManagementService.create.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 400, error: ['Email already in use.'] })),
    );
    const fixture = createComponent();
    fillValidForm(fixture);

    fixture.componentInstance.submit();

    expect(fixture.componentInstance.errorMessage()).toBe('Email already in use.');
  });

  it('surfaces a ValidationProblemDetails error body', () => {
    userManagementService.create.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: { errors: { FullName: ['The field FullName must be a string with a maximum length of 200.'] } },
          }),
      ),
    );
    const fixture = createComponent();
    fillValidForm(fixture);

    fixture.componentInstance.submit();

    expect(fixture.componentInstance.errorMessage()).toBe(
      'The field FullName must be a string with a maximum length of 200.',
    );
  });

  it('surfaces a { message } error body', () => {
    userManagementService.create.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'Could not assign role.' } })),
    );
    const fixture = createComponent();
    fillValidForm(fixture);

    fixture.componentInstance.submit();

    expect(fixture.componentInstance.errorMessage()).toBe('Could not assign role.');
  });

  it('stops submitting and re-enables the form after an error', () => {
    userManagementService.create.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'Nope' } })),
    );
    const fixture = createComponent();
    fillValidForm(fixture);

    fixture.componentInstance.submit();

    expect(fixture.componentInstance.submitting()).toBe(false);
  });
});
