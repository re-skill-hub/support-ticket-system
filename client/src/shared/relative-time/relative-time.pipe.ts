import { Pipe, PipeTransform } from '@angular/core';

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
];

@Pipe({ name: 'relativeTime', pure: false })
export class RelativeTimePipe implements PipeTransform {
  private readonly formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  transform(value: string | null | undefined): string {
    if (!value) {
      return '';
    }

    const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);

    if (Math.abs(seconds) < 60) {
      return 'just now';
    }

    for (const [unit, secondsInUnit] of UNITS) {
      if (Math.abs(seconds) >= secondsInUnit) {
        return this.formatter.format(Math.round(seconds / secondsInUnit), unit);
      }
    }

    return this.formatter.format(Math.round(seconds / 60), 'minute');
  }
}
