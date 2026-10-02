import { FormControl } from '@angular/forms';
import { passwordComplexity } from './password.validator';

describe('passwordComplexity', () => {
  it('passes a password satisfying every rule', () => {
    expect(passwordComplexity(new FormControl('Str0ng!Pass'))).toBeNull();
  });

  it('is a no-op on an empty value (required handles that separately)', () => {
    expect(passwordComplexity(new FormControl(''))).toBeNull();
  });

  it('flags a password under 8 characters', () => {
    expect(passwordComplexity(new FormControl('Str0ng!'))?.['minlength']).toBe(true);
  });

  it('flags a password with no lowercase letter', () => {
    expect(passwordComplexity(new FormControl('STR0NG!PASS'))?.['requiresLowercase']).toBe(true);
  });

  it('flags a password with no uppercase letter', () => {
    expect(passwordComplexity(new FormControl('str0ng!pass'))?.['requiresUppercase']).toBe(true);
  });

  it('flags a password with no digit', () => {
    expect(passwordComplexity(new FormControl('Strong!Pass'))?.['requiresDigit']).toBe(true);
  });

  it('flags a password with no non-alphanumeric character', () => {
    expect(passwordComplexity(new FormControl('Str0ngPass'))?.['requiresNonAlphanumeric']).toBe(true);
  });

  it('flags every unmet rule at once for a weak all-lowercase password', () => {
    const errors = passwordComplexity(new FormControl('weakpassword'));
    expect(errors).toEqual({ requiresUppercase: true, requiresDigit: true, requiresNonAlphanumeric: true });
  });
});
