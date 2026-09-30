import { Directive, input, output } from '@angular/core';

export type SortDirection = 'asc' | 'desc' | '';

export interface SortEvent {
  column: string;
  direction: SortDirection;
}

const rotate: Record<SortDirection, SortDirection> = { asc: 'desc', desc: '', '': 'asc' };

const ariaSort: Record<SortDirection, 'ascending' | 'descending' | 'none'> = {
  asc: 'ascending',
  desc: 'descending',
  '': 'none',
};

/**
 * Click-to-sort table header, the standard ng-bootstrap sortable-table pattern:
 * the directive only rotates asc/desc/'' and emits it — the parent component
 * owns the actual sort column/direction state and re-binds [direction] back down.
 * Keyboard-focusable (tabindex + Enter/Space) and exposes aria-sort so the
 * current sort state is announced to assistive tech, not just shown visually.
 */
@Directive({
  selector: 'th[appSortable]',
  host: {
    role: 'columnheader',
    tabindex: '0',
    '[class.sort-asc]': 'direction() === "asc"',
    '[class.sort-desc]': 'direction() === "desc"',
    '[attr.aria-sort]': 'ariaSort[direction()]',
    '(click)': 'onClick()',
    '(keydown.enter)': 'onClick()',
    '(keydown.space)': 'onClick(); $event.preventDefault()',
  },
})
export class SortableHeader {
  readonly appSortable = input.required<string>();
  readonly direction = input<SortDirection>('');
  readonly sort = output<SortEvent>();
  protected readonly ariaSort = ariaSort;

  onClick(): void {
    this.sort.emit({ column: this.appSortable(), direction: rotate[this.direction()] });
  }
}
