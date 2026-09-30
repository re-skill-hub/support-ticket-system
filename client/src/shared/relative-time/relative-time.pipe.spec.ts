import { RelativeTimePipe } from './relative-time.pipe';

describe('RelativeTimePipe', () => {
  const pipe = new RelativeTimePipe();

  it('returns an empty string for a missing value', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
  });

  it('returns "just now" for timestamps under a minute old', () => {
    const value = new Date(Date.now() - 10_000).toISOString();
    expect(pipe.transform(value)).toBe('just now');
  });

  it('formats minutes ago', () => {
    const value = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(pipe.transform(value)).toBe('5 minutes ago');
  });

  it('formats hours ago', () => {
    const value = new Date(Date.now() - 3 * 60 * 60_000).toISOString();
    expect(pipe.transform(value)).toBe('3 hours ago');
  });

  it('formats days ago', () => {
    const value = new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString();
    expect(pipe.transform(value)).toBe('2 days ago');
  });
});
