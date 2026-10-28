import { Pipe, PipeTransform } from '@angular/core';
import { Marked } from 'marked';

const markdown = new Marked({
    gfm: true,
    breaks: true,
    renderer: {
        html({ text }) {
            return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        },
    },
});

@Pipe({ name: 'notesMarkdown' })
export class NotesMarkdownPipe implements PipeTransform {
    transform(value: string | undefined): string {
        // Return ordinary HTML so Angular's innerHTML binding still sanitizes it.
        return markdown.parse(value ?? '', { async: false });
    }
}
