import { Pipe, PipeTransform } from "@angular/core";

import { Marked } from "marked";


const markdown = new Marked({
    gfm: true,
    breaks: true,
    renderer: {
        /**
         * Escapes raw HTML. For example, <img ...> becomes visible text instead of an image element.
         */
        html ({ text }) {
            return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        },
    },
});


@Pipe({
    name: "ggMarkdown"
})
export class MarkdownPipe implements PipeTransform {

    /**
     * Transforms a markdown string into HTML.
     *
     * @param value - The markdown string to transform into HTML.
     * @returns     The HTML string generated from the markdown input.
     */
    transform (value: string | undefined): string {
        // Return ordinary HTML so Angular's innerHTML binding still sanitizes it.
        return markdown.parse(value ?? "", { async: false });
    }
}
