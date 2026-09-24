import { Directive, input, output } from '@angular/core';

export type SortDirection = 'asc' | 'desc' | '';

export interface SortEvent {
  column: string;
  direction: SortDirection;
}

const rotate: Record<SortDirection, SortDirection> = { asc: 'desc', desc: '', '': 'asc' };

/**
 * Click-to-sort table header, the standard ng-bootstrap sortable-table pattern:
 * the directive only rotates asc/desc/'' and emits it — the parent component
 * owns the actual sort column/direction state and re-binds [direction] back down.
 */
@Directive({
  selector: 'th[appSortable]',
  host: {
    '[class.sort-asc]': 'direction() === "asc"',
    '[class.sort-desc]': 'direction() === "desc"',
    '(click)': 'onClick()',
  },
})
export class SortableHeader {
  readonly appSortable = input.required<string>();
  readonly direction = input<SortDirection>('');
  readonly sort = output<SortEvent>();

  onClick(): void {
    this.sort.emit({ column: this.appSortable(), direction: rotate[this.direction()] });
  }
}
