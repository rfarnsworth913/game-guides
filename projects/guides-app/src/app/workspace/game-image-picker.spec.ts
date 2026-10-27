import { TestBed } from '@angular/core/testing';
import { GameImagePicker } from './game-image-picker';

describe('GameImagePicker', () => {
    afterEach(() => vi.unstubAllGlobals());

    function picker() {
        const fixture = TestBed.createComponent(GameImagePicker);
        fixture.componentRef.setInput('game', 'endfield');
        fixture.componentRef.setInput('label', 'Header image');
        return fixture;
    }
    it('selects and removes navigation images without exposing image metadata or manual URL controls', () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const fixture = picker();
        fixture.componentRef.setInput('label', 'Section Image');
        fixture.componentRef.setInput('selectionOnly', true);
        fixture.componentRef.setInput('value', '/api/games/endfield/images/existing.webp');
        fixture.detectChanges();
        const root = fixture.nativeElement as HTMLElement;
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
        expect(fixture.nativeElement.querySelector('.compact-icon-button')).not.toBeNull();
        expect(fixture.nativeElement.querySelector('.image-picker')).toBeNull();
        expect(fixture.nativeElement.querySelector('.image-preview')).toBeNull();
        fixture.componentInstance.iconDraft.set('  Fire  ');
        fixture.componentInstance.useIconDraft();
        fixture.detectChanges();
        expect(fixture.componentInstance.value()).toBe('Fire');
        expect(fixture.nativeElement.querySelector('.compact-icon-button').textContent).toContain('Fire');
        const remove = [...fixture.nativeElement.querySelectorAll('.compact-icon-menu button')]
            .find((button: any) => button.textContent.trim() === 'Remove Icon') as HTMLButtonElement;
        remove.click();
        expect(fixture.componentInstance.value()).toBe('');
    });

    it('loads the current game library and selects a previously uploaded image', async () => {
        const image = { name: 'banner.png', url: '/api/games/endfield/images/banner.png',
            details: { title: 'The Red Knight', category: 'banner', description: 'Knight artwork', sourceName: 'Official site', sourceUrl: 'https://example.com' } };
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ images: [image] }) });
        vi.stubGlobal('fetch', fetchMock);
        const fixture = picker();
        await fixture.componentInstance.browse();
        fixture.detectChanges();
        expect(fetchMock).toHaveBeenCalledWith('/api/games/endfield/images', expect.objectContaining({ credentials: 'same-origin' }));
        const button = fixture.nativeElement.querySelector('.image-library button') as HTMLButtonElement;
        button.click();
        expect(fixture.componentInstance.value()).toBe('');
        expect(fixture.componentInstance.open()).toBe(true);
        fixture.detectChanges();
        (fixture.nativeElement.querySelector('.use-selected') as HTMLButtonElement).click();
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

    it('uploads image bytes and uses the returned reference', async () => {
        const image = { name: 'banner.png', url: '/api/games/endfield/images/banner.png' };
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => image });
        vi.stubGlobal('fetch', fetchMock);
        const component = picker().componentInstance;
        const file = new File(['bytes'], 'Banner.png', { type: 'image/png' });
        await component.upload({ target: { files: [file], value: 'Banner.png' } } as unknown as Event);
        expect(fetchMock).toHaveBeenCalledWith('/api/games/endfield/images?name=Banner.png', expect.objectContaining({ method: 'POST', body: file }));
        expect(component.value()).toBe(image.url);
        expect(component.uploading()).toBe(false);
    });

    it.each(['', 'image/x-png', 'application/octet-stream'])('accepts PNG files with browser MIME metadata %j', async (type) => {
        const image = { name: 'banner.png', url: '/api/games/endfield/images/banner.png' };
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => image });
        vi.stubGlobal('fetch', fetchMock);
        const component = picker().componentInstance;
        const file = new File(['bytes'], 'Banner.PNG', { type });
        await component.upload({ target: { files: [file], value: 'Banner.PNG' } } as unknown as Event);
        expect(fetchMock).toHaveBeenCalledWith('/api/games/endfield/images?name=Banner.PNG', expect.objectContaining({ headers: expect.any(Headers), body: file }));
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
});
