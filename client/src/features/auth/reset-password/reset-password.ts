import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { extractMessage } from '../../../core/interceptors/error.interceptor';

@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.scss',
})
export class ResetPassword {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly email = this.route.snapshot.queryParamMap.get('email') ?? '';
  private readonly token = this.route.snapshot.queryParamMap.get('token') ?? '';

  readonly linkInvalid = !this.email || !this.token;
  readonly loading = signal(false);
  readonly submitted = signal(false);
  readonly resetError = signal<string | null>(null);

  readonly form = this.fb.group({
    newPassword: this.fb.control('', [Validators.required, Validators.minLength(8)]),
  });

  submit(): void {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.resetError.set(null);
    const { newPassword } = this.form.getRawValue();

    this.authService.resetPassword({ email: this.email, token: this.token, newPassword: newPassword! }).subscribe({
      next: () => {
        this.loading.set(false);
        this.submitted.set(true);
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.resetError.set(extractMessage(error));
      },
    });
  }

  goToLogin(): void {
    this.router.navigateByUrl('/login');
  }
}
