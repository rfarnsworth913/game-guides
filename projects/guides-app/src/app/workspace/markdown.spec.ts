import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NotesMarkdownPipe } from './markdown';

@Component({ imports: [NotesMarkdownPipe], template: '<div [innerHTML]="notes | notesMarkdown"></div>' })
class MarkdownHost { notes = ''; }

describe('Notes Markdown', () => {
    it('renders formatting, lists, links and line breaks', () => {
        const html = new NotesMarkdownPipe().transform('**Bold** and *italic*\nNext line\n\n- One\n- [Two](https://example.com)');
        expect(html).toContain('<strong>Bold</strong>');
        expect(html).toContain('<em>italic</em>');
        expect(html).toContain('<br>');
        expect(html).toContain('<ul>');
        expect(html).toContain('href="https://example.com"');
    });
    it('escapes raw HTML and keeps Angular link sanitization active', () => {
        const fixture = TestBed.createComponent(MarkdownHost);
        fixture.componentInstance.notes = '<img src=x onerror="alert(1)">\n\n[Unsafe](javascript:alert%281%29)';
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('img')).toBeNull();
        expect(fixture.nativeElement.querySelector('a').getAttribute('href')).not.toMatch(/^javascript:/);
    });
});
