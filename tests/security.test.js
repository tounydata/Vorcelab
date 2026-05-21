import { describe, it, expect } from 'vitest';
import { escapeHTML, escapeAttr, safeUrl } from '../security.js';

describe('escapeHTML', () => {
  it('returns empty string for null', () => expect(escapeHTML(null)).toBe(''));
  it('returns empty string for undefined', () => expect(escapeHTML(undefined)).toBe(''));
  it('escapes & < > " \'', () =>
    expect(escapeHTML('<b>&"\'x</b>')).toBe('&lt;b&gt;&amp;&quot;&#39;x&lt;/b&gt;'));
  it('leaves plain text untouched', () => expect(escapeHTML('hello world')).toBe('hello world'));
  it('converts numbers to string', () => expect(escapeHTML(42)).toBe('42'));
});

describe('escapeAttr', () => {
  it('returns empty string for null', () => expect(escapeAttr(null)).toBe(''));
  it('escapes & " \' < >', () =>
    expect(escapeAttr('a&b"c\'d<e>f')).toBe('a&amp;b&quot;c&#39;d&lt;e&gt;f'));
  it('leaves plain text untouched', () => expect(escapeAttr('safe')).toBe('safe'));
});

describe('safeUrl', () => {
  it('returns empty string for null', () => expect(safeUrl(null)).toBe(''));
  it('returns empty string for empty string', () => expect(safeUrl('')).toBe(''));
  it('blocks javascript: URLs', () => expect(safeUrl('javascript:alert(1)')).toBe(''));
  it('blocks JavaScript: case-insensitive', () => expect(safeUrl('JavaScript:void(0)')).toBe(''));
  it('blocks JAVASCRIPT: all caps', () => expect(safeUrl('JAVASCRIPT:x')).toBe(''));
  it('passes https URLs through', () => expect(safeUrl('https://example.com/path')).toBe('https://example.com/path'));
  it('passes relative paths through', () => expect(safeUrl('/assets/img.png')).toBe('/assets/img.png'));
  it('trims surrounding whitespace', () => expect(safeUrl('  https://example.com  ')).toBe('https://example.com'));
});
