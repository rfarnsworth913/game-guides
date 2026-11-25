import { TestBed } from '@angular/core/testing';
import { GameImagePicker } from "./game-image-picker";

describe('GameImagePicker', () => {
    afterEach(() => vi.unstubAllGlobals());

    function picker() {
        const fixture = TestBed.createComponent(GameImagePicker);
        fixture.componentRef.setInput('game', 'endfield');
        fixture.componentRef.setInput('label', 'Header image');
        return fixture;
    }
    it('shows recommendations for square images, banners and full artwork beside the picker and in its library', () => {
        const fixture = picker();
        const root = fixture.nativeElement as HTMLElement;
        fixture.detectChanges();
        expect(root.querySelector('.image-dimensions')?.textContent).toContain('512 × 512 px');
        fixture.componentRef.setInput('banner', true);
        fixture.detectChanges();
        expect(root.querySelector('.image-dimensions')?.textContent).toContain('1200 × 400 px');
        fixture.componentRef.setInput('imagePurpose', 'fullArt');
        fixture.componentInstance.open.set(true);
        fixture.detectChanges();
        expect(root.querySelector('.image-dimensions')?.textContent).toContain('1200 × 1600 px');
        expect(root.querySelector('.library-heading')?.textContent).toContain('1200 × 1600 px');
        expect(root.querySelector('.library-heading')?.textContent).toContain('Other sizes are supported');
        fixture.componentRef.setInput('imagePurpose', 'header');
        fixture.detectChanges();
        expect(root.querySelector('.image-dimensions')?.textContent).toContain('1200 × 240 px');
    });
    it('overlays real banner dimensions and format without inventing unavailable file sizes', () => {
        const fixture = picker();
        const url = '/api/games/genshin/images/banner.webp';
        fixture.componentRef.setInput('previewOverlay', true);
        fixture.componentRef.setInput('banner', true);
        fixture.componentRef.setInput('value', url);
        fixture.componentInstance.dimensions.set({ [url]: { width: 1200, height: 400 } });
        fixture.detectChanges();
        const root = fixture.nativeElement as HTMLElement;
        expect(root.querySelector('.preview-name')?.textContent).toContain('Current banner');
        expect(root.querySelector('.preview-metadata')?.textContent).toBe('1200 × 400 · WebP');
        expect(root.querySelector('.image-control-row .current-image')).toBeNull();
        expect(root.querySelector('.image-guidance-bar')?.textContent).toContain('Max 10 MB');
        fixture.componentInstance.failedPreview.set(url);
        fixture.detectChanges();
        expect(root.querySelector('.preview-info')).toBeNull();
        expect(root.querySelector('.image-empty.banner-preview')).not.toBeNull();
    });
    it('keeps icon dimensions visible beside the compact button and in its selection popover', () => {
        const fixture = picker();
        fixture.componentRef.setInput('compact', true);
        fixture.detectChanges();
        const root = fixture.nativeElement as HTMLElement;
        expect(root.querySelector('.compact-dimensions')?.textContent).toContain('256 × 256');
        expect(root.querySelector('.compact-dimensions')?.getAttribute('aria-label')).toContain('Recommended: 256 × 256 px');
        expect(root.querySelector('.compact-icon-menu')?.textContent).toContain('Recommended: 256 × 256 px');
    });
    it('selects and removes navigation images without exposing image metadata or manual URL controls', () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const fixture = picker();
        fixture.componentRef.setInput('label', 'Section Image');
        fixture.componentRef.setInput('selectionOnly', true);
        fixture.componentRef.setInput('value', '/api/games/endfield/images/existing.webp');
        fixture.detectChanges();
        const root = (fixture.nativeElement as HTMLElement) as HTMLElement;
        expect(root.querySelector('.image-preview')?.getAttribute('src')).toBe('/api/games/endfield/images/existing.webp');
        expect(root.querySelector('.image-details')).toBeNull();
        expect(root.querySelector('.image-advanced')).toBeNull();
        expect(root.textContent).not.toContain('Image Type');
        expect(root.textContent).not.toContain('URL or symbol');
        expect(root.querySelector('input[type="file"]')).not.toBeNull();
        expect(root.textContent).toContain('Browse Library');
        fixture.componentInstance.pending.set({ name: 'new.webp', url: '/api/games/endfield/images/new.webp', details: { category: 'landscape', description: 'Existing library details' } });
        fixture.componentInstance.useSelected();
        fixture.detectChanges();
        expect(fixture.componentInstance.value()).toBe('/api/games/endfield/images/new.webp');
        root.querySelector<HTMLButtonElement>('.remove-image')!.click();
        fixture.detectChanges();
        expect(fixture.componentInstance.value()).toBe('');
        expect(fetchMock).not.toHaveBeenCalled();
        fixture.componentRef.setInput('selectionOnly', false);
        fixture.detectChanges();
        expect(root.querySelector('.image-details')).not.toBeNull();
        expect(root.querySelector('.image-advanced')).not.toBeNull();
    });
    it('shows a compact icon control and supports symbols and removal without expanding the form', () => {
        const fixture = picker();
        fixture.componentRef.setInput('compact', true);
        fixture.componentRef.setInput('label', 'Damage Type Icon');
        fixture.detectChanges();
        expect((fixture.nativeElement as HTMLElement).querySelector('.compact-icon-button')).not.toBeNull();
        expect((fixture.nativeElement as HTMLElement).querySelector('.image-picker')).toBeNull();
        expect((fixture.nativeElement as HTMLElement).querySelector('.image-preview')).toBeNull();
        fixture.componentInstance.iconDraft.set('  Fire  ');
        fixture.componentInstance.useIconDraft();
        fixture.detectChanges();
        expect(fixture.componentInstance.value()).toBe('Fire');
        expect((fixture.nativeElement as HTMLElement).querySelector('.compact-icon-button')!.textContent).toContain('Fire');
        const remove = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.compact-icon-menu button')]
            .find((button: Element) => button.textContent?.trim() === 'Remove Icon') as HTMLButtonElement;
        remove.click();
        expect(fixture.componentInstance.value()).toBe('');
    });

    it('loads the current game library and selects a previously uploaded image', async () => {
        const image = { name: 'banner.png', url: '/api/games/endfield/images/banner.png',
            details: { title: 'The Red Knight', category: 'banner', description: 'Knight artwork', sourceName: 'Official site', sourceUrl: 'https://example.com' } };
        const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({ ok: true, json: async () => ({ images: [image] }) } as Response);
        vi.stubGlobal('fetch', fetchMock);
        const fixture = picker();
        fixture.componentRef.setInput('banner', true);
        await fixture.componentInstance.browse();
        fixture.detectChanges();
        expect(fetchMock).toHaveBeenCalledWith('/api/games/endfield/images', expect.objectContaining({ credentials: 'same-origin' }));
        const button = (fixture.nativeElement as HTMLElement).querySelector('.image-library .image-select') as HTMLButtonElement;
        button.click();
        expect(fixture.componentInstance.value()).toBe('');
        expect(fixture.componentInstance.open()).toBe(true);
        fixture.detectChanges();
        ((fixture.nativeElement as HTMLElement).querySelector('.use-selected') as HTMLButtonElement).click();
        expect(fixture.componentInstance.value()).toBe(image.url);
        expect(fixture.componentInstance.description()).toBe('Knight artwork');
        expect(fixture.componentInstance.sourceName()).toBe('Official site');
        expect(fixture.componentInstance.sourceUrl()).toBe('https://example.com');
        expect(fixture.componentInstance.open()).toBe(false);
    });

    it('cancels selection without changing the parent value or attribution', async () => {
        const component = picker().componentInstance;
        component.value.set('https://example.com/original.png');
        component.description.set('Keep this description');
        component.pending.set({ name: 'new.png', url: '/api/games/endfield/images/new.png' });
        component.open.set(true);
        component.cancelLibrary();
        expect(component.value()).toBe('https://example.com/original.png');
        expect(component.description()).toBe('Keep this description');
        expect(component.pending()).toBeNull();
    });

    it('includes shared artwork in every assigned category and preserves explicit square splash art', () => {
        const component = picker().componentInstance;
        const shared = { name: 'hero.webp', url: '/api/games/endfield/images/hero.webp', width: 512, height: 512,
            details: { category: 'character' as const, categories: ['character' as const, 'headshot' as const] } };
        component.images.set([shared]);
        for (const filter of ['character', 'headshot']) {
            component.filter.set(filter);
            expect(component.filteredImages()).toEqual([shared]);
        }
        component.filter.set('icon');
        expect(component.filteredImages()).toEqual([]);
        expect(component.kind(shared)).toBe('character');
    });

    it('filters by tags and type and detects the recommended banner ratio', () => {
        const component = picker().componentInstance;
        const banner = { name: 'red-knight.png', url: '/a', details: { title: 'Red Knight', tags: 'Endfield Laevatain', category: 'banner' as const, width: 1200, height: 400 } };
        component.images.set([banner, { name: 'icon.png', url: '/b', details: { category: 'icon' } }]);
        component.search.set('laevatain');
        expect(component.filteredImages()).toEqual([banner]);
        component.filter.set('icon');
        expect(component.filteredImages()).toEqual([]);
        expect(component.matchesBanner(banner)).toBe(true);
    });

    it('combines category, debounced search and sorting, and pages large libraries', async () => {
        vi.useFakeTimers();
        try {
            const component = picker().componentInstance;
            component.images.set(Array.from({ length: 70 }, (_, index) => ({ name: `scene-${index}.png`, url: `/api/games/endfield/images/scene-${index}.png`, details: { category: 'banner', tags: 'Valley IV' }, createdAt: new Date(2026, 0, index + 1).toISOString() })));
            component.setFilter('banner');
            expect(component.visibleImages()).toHaveLength(48);
            component.visibleCount.set(96);
            expect(component.visibleImages()).toHaveLength(70);
            component.queueSearch('VALLEY scene 6');
            expect(component.filteredImages()).toHaveLength(70);
            await vi.advanceTimersByTimeAsync(180);
            expect(component.filteredImages().map(image => image.name)).toContain('scene-6.png');
            expect(component.visibleCount()).toBe(48);
            component.setSort('name-desc');
            expect(component.filteredImages()[0].name).toBe('scene-69.png');
            component.setFilter('icon');
            expect(component.filteredImages()).toHaveLength(0);
        } finally { vi.useRealTimers(); }
    });

    it('preselects the current image and preserves browsing context without saving on cancel', async () => {
        const images = [
            { name: 'new.png', url: '/api/games/endfield/images/new.png', width: 1200, height: 400 },
            { name: 'old.png', url: '/api/games/endfield/images/old.png', width: 1200, height: 400 },
        ];
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ images }) });
        vi.stubGlobal('fetch', fetchMock);
        const fixture = picker();
        fixture.componentRef.setInput('banner', true);
        const component = fixture.componentInstance;
        component.value.set(images[1].url);
        await component.browse();
        expect(component.pending()?.url).toBe(images[1].url);
        expect(component.filter()).toBe('banner');
        component.setFilter('');
        component.setSort('name-desc');
        component.selectImage(images[0]);
        component.cancelLibrary();
        expect(component.value()).toBe(images[1].url);
        await component.browse();
        expect(component.filter()).toBe('');
        expect(component.sort()).toBe('name-desc');
        expect(component.pending()?.url).toBe(images[1].url);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        component.cancelLibrary();
    });

    it('keeps preview metadata read-only and supports double-click confirmation', () => {
        const fixture = picker();
        const component = fixture.componentInstance;
        const image = { name: 'scene.webp', url: '/api/games/endfield/images/scene.webp', thumbnailUrl: '/api/games/endfield/images/scene.webp?thumbnail=1', width: 1200, height: 400, fileSize: 1024, details: { category: 'banner' as const, description: 'Valley IV', sourceName: 'Artist' } };
        component.images.set([image]);
        component.open.set(true);
        fixture.detectChanges();
        component.showPreview(image);
        fixture.detectChanges();
        const root = fixture.nativeElement as HTMLElement;
        expect(root.querySelector('.thumbnail img')?.getAttribute('src')).toBe(image.thumbnailUrl);
        expect(root.querySelector('.library-full-image')?.getAttribute('src')).toBe(image.url);
        expect(root.querySelector('.library-image-preview input')).toBeNull();
        expect(root.querySelector('.library-advanced')).toBeNull();
        expect(component.value()).toBe('');
        component.closePreview();
        root.querySelector('.image-select')!.dispatchEvent(new MouseEvent('dblclick'));
        expect(component.value()).toBe(image.url);
        expect(component.description()).toBe('Valley IV');
    });

    it('uploads image bytes and uses the returned reference', async () => {
        const image = { name: 'banner.png', url: '/api/games/endfield/images/banner.png' };
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => image } as Response);
        vi.stubGlobal('fetch', fetchMock);
        const component = picker().componentInstance;
        const file = new File(['bytes'], 'Banner.png', { type: 'image/png' });
        await component.upload({ target: { files: [file], value: 'Banner.png' } } as unknown as Event);
        expect(fetchMock).toHaveBeenCalledWith('/api/games/endfield/images?name=Banner.png&category=landscape', expect.objectContaining({ method: 'POST', body: file }));
        expect(component.value()).toBe(image.url);
        expect(component.uploading()).toBe(false);
    });

    it.each(['', 'image/x-png', 'application/octet-stream'])('accepts PNG files with browser MIME metadata %j', async (type) => {
        const image = { name: 'banner.png', url: '/api/games/endfield/images/banner.png' };
        const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({ ok: true, json: async () => image } as Response);
        vi.stubGlobal('fetch', fetchMock);
        const component = picker().componentInstance;
        const file = new File(['bytes'], 'Banner.PNG', { type });
        await component.upload({ target: { files: [file], value: 'Banner.PNG' } } as unknown as Event);
        expect(fetchMock).toHaveBeenCalledWith('/api/games/endfield/images?name=Banner.PNG&category=landscape', expect.objectContaining({ headers: expect.any(Headers) as unknown, body: file }));
        expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Content-Type')).toBe('image/png');
        expect(component.value()).toBe(image.url);
        expect(component.error()).toBe('');
    });

    it('preserves the current image and reports a failed upload', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Upload failed' }) }));
        const component = picker().componentInstance;
        component.value.set('https://example.com/original.png');
        await component.upload({ target: { files: [new File(['bytes'], 'new.png', { type: 'image/png' })], value: 'new.png' } } as unknown as Event);
        expect(component.value()).toBe('https://example.com/original.png');
        expect(component.error()).toBe('Upload failed');
        expect(component.uploading()).toBe(false);
    });
    it('previews deferred files, uploads only on commit and releases the preview URL', async () => {
        class PreviewURL extends URL {
            static override createObjectURL = vi.fn(() => 'blob:pending-preview');
            static override revokeObjectURL = vi.fn();
        }
        vi.stubGlobal('URL', PreviewURL);
        const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ name: 'icon-a.png', url: '/api/games/endfield/images/icon-a.png' }) });
        vi.stubGlobal('fetch', fetcher);
        const fixture = picker();
        fixture.componentRef.setInput('deferUploads', true);
        fixture.componentRef.setInput('selectionOnly', true);
        fixture.componentRef.setInput('libraryAvailable', false);
        fixture.detectChanges();
        const component = fixture.componentInstance;
        const file = new File(['bytes'], 'Icon.png', { type: 'image/png' });
        await component.upload({ target: { files: [file], value: 'Icon.png' } } as unknown as Event);
        fixture.detectChanges();
        await fixture.whenStable();
        expect(component.pendingFile()).toBe(file);
        expect((fixture.nativeElement as HTMLElement).querySelector('img')?.getAttribute('src')).toBe('blob:pending-preview');
        await component.browse();
        expect(fetcher).not.toHaveBeenCalled();
        expect(await component.commitPendingUpload()).toBe('/api/games/endfield/images/icon-a.png');
        fixture.detectChanges();
        await fixture.whenStable();
        expect(component.pendingFile()).toBeNull();
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(PreviewURL.revokeObjectURL).toHaveBeenCalledWith('blob:pending-preview');
        fixture.destroy();
    });
    it('retains a deferred file on upload failure and allows a URL to replace it', async () => {
        class PreviewURL extends URL {
            static override createObjectURL = vi.fn(() => 'blob:pending-preview');
            static override revokeObjectURL = vi.fn();
        }
        vi.stubGlobal('URL', PreviewURL);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Image not accepted' }) }));
        const fixture = picker();
        fixture.componentRef.setInput('deferUploads', true);
        const component = fixture.componentInstance;
        const file = new File(['bytes'], 'Icon.png', { type: 'image/png' });
        await component.upload({ target: { files: [file], value: '' } } as unknown as Event);
        await expect(component.commitPendingUpload()).rejects.toThrow('Image not accepted');
        expect(component.pendingFile()).toBe(file);
        component.setImageUrl('https://example.com/replacement.png');
        fixture.detectChanges();
        expect(component.error()).toBe('');
        expect(component.pendingFile()).toBeNull();
        expect(component.previewUrl()).toBe('https://example.com/replacement.png');
        fixture.destroy();
    });
});
