import { signal } from '@angular/core';
import { Observable } from 'rxjs';

/**
 * Formalizes the loading/error/retry signal pattern already implemented ad hoc per-component
 * (e.g. user-list.ts's `loading`/`loadError`/`retry()`). Not mass-migrated across the app in
 * this pass — introduced here and adopted in UserList as a reference for new components.
 */
export class RequestState<T> {
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly data = signal<T | undefined>(undefined);

  private lastSource?: () => Observable<T>;

  /** Runs `source`, tracking loading/error/data, and remembers it so retry() can re-run the same call. */
  run(source: () => Observable<T>): void {
    this.lastSource = source;
    this.loading.set(true);
    this.error.set(false);

    source().subscribe({
      next: (value) => {
        this.data.set(value);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set(true);
      },
    });
  }

  /** Re-runs the last source passed to run(). No-op if run() hasn't been called yet. */
  retry(): void {
    if (this.lastSource) {
      this.run(this.lastSource);
    }
  }
}
