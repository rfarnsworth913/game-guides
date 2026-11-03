import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";

import { MarkdownPipe } from "./markdown";


@Component({
    selector: "gg-markdown-test-host",
    imports: [MarkdownPipe],
    template: "<div [innerHTML]=\"notes | ggMarkdown\"></div>"
})
class MarkdownHost { notes = ""; }


describe("Markdown Pipe", () => {

    it("renders formatting, lists, links and line breaks", () => {
        const html = new MarkdownPipe().transform("**Bold** and *italic*\nNext line\n\n- One\n- [Two](https://example.com)");

        expect(html).toContain("<strong>Bold</strong>");
        expect(html).toContain("<em>italic</em>");
        expect(html).toContain("<br>");
        expect(html).toContain("<ul>");
        expect(html).toContain("href=\"https://example.com\"");
    });

    it("escapes raw HTML and keeps Angular link sanitization active", () => {
        const fixture = TestBed.createComponent(MarkdownHost);
        fixture.componentInstance.notes = "<img src=x onerror=\"alert(1)\">\n\n[Unsafe](javascript:alert%281%29)";
        fixture.detectChanges();
        const element = ((fixture.nativeElement as HTMLElement) as HTMLElement) as HTMLElement;
        const link = element.querySelector("a");

        expect(element.querySelector("img")).toBeNull();
        expect(link).not.toBeNull();
        expect(link?.getAttribute("href")).not.toMatch(/^javascript:/);
    });
});
