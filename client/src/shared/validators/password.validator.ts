import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Mirrors TicketService's actual ASP.NET Identity password policy (Program.cs only overrides
 * RequiredLength to 8 — RequireDigit/RequireLowercase/RequireUppercase/RequireNonAlphanumeric are
 * all left at Identity's default of true), so a password accepted here won't be rejected by the
 * server. Returns one error key per unmet rule, so the template can list exactly what's missing.
 */
export const passwordComplexity: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = control.value as string | null;
  if (!value) {
    return null;
  }

  const errors: ValidationErrors = {};
  if (value.length < 8) {
    errors['minlength'] = true;
  }
  if (!/[a-z]/.test(value)) {
    errors['requiresLowercase'] = true;
  }
  if (!/[A-Z]/.test(value)) {
    errors['requiresUppercase'] = true;
  }
  if (!/[0-9]/.test(value)) {
    errors['requiresDigit'] = true;
  }
  if (!/[^a-zA-Z0-9]/.test(value)) {
    errors['requiresNonAlphanumeric'] = true;
  }

  return Object.keys(errors).length > 0 ? errors : null;
};
