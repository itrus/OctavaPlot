import { describe, expect, it } from 'vitest';
import { formatBytes, keyName, measureLocalStorage } from './storageUsage';

const fake = (data: Record<string, string>) => {
  const keys = Object.keys(data);
  return { length: keys.length, key: (i: number) => keys[i] ?? null, getItem: (k: string) => data[k] ?? null };
};

describe('measureLocalStorage', () => {
  it('counts UTF-16 bytes, separates the app keys and sorts them largest first', () => {
    const u = measureLocalStorage(fake({ 'octavaplot:a': 'xx', 'octavaplot:big': 'x'.repeat(100), other: 'yyy' }));
    expect(u.rows.map((r) => r.key)).toEqual(['octavaplot:big', 'octavaplot:a']);
    expect(u.rows[1].bytes).toBe(('octavaplot:a'.length + 2) * 2);
    expect(u.originBytes).toBe(u.appBytes + ('other'.length + 3) * 2);
  });
  it('handles an empty store', () => {
    expect(measureLocalStorage(fake({}))).toEqual({ rows: [], appBytes: 0, originBytes: 0 });
  });
});

describe('keyName', () => {
  it('names the app keys and leaves others alone', () => {
    expect(keyName('octavaplot:project:autosave:backup')).toBe('Start-up backup');
    expect(keyName('octavaplot:settings:v2')).toBe('Settings');
    expect(keyName('octavaplot:future')).toBe('octavaplot:future');
  });
});

describe('formatBytes', () => {
  it('picks a unit', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.00 MB');
  });
});
