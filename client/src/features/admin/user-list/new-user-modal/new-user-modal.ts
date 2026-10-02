import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { extractMessage } from '../../../../core/interceptors/error.interceptor';
import { UserManagementService } from '../../../../core/services/user-management.service';
import { ROLES, Role } from '../../../../types/auth.types';
import { passwordComplexity } from '../../../../shared/validators/password.validator';

@Component({
  selector: 'app-new-user-modal',
  imports: [ReactiveFormsModule],
  templateUrl: './new-user-modal.html',
})
export class NewUserModal {
  readonly activeModal = inject(NgbActiveModal);
  private readonly fb = inject(FormBuilder);
  private readonly userManagementService = inject(UserManagementService);

  readonly roles = ROLES;
  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.group({
    email: this.fb.control('', [Validators.required, Validators.email]),
    password: this.fb.control('', [Validators.required, passwordComplexity]),
    fullName: this.fb.control('', [Validators.required, Validators.maxLength(200)]),
    role: this.fb.control<Role>('Customer', [Validators.required]),
  });

  submit(): void {
    if (this.form.invalid || this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    const { email, password, fullName, role } = this.form.getRawValue();

    this.userManagementService.create({ email: email!, password: password!, fullName: fullName!, role: role! }).subscribe({
      next: (user) => this.activeModal.close(user),
      error: (err) => {
        this.submitting.set(false);
        this.errorMessage.set(extractMessage(err));
      },
    });
  }

  cancel(): void {
    this.activeModal.dismiss();
  }
}
