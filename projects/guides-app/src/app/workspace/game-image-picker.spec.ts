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

    it('loads the current game library and selects a previously uploaded image', async () => {
        const image = { name: 'banner.png', url: '/api/games/endfield/images/banner.png' };
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ images: [image] }) });
        vi.stubGlobal('fetch', fetchMock);
        const fixture = picker();
        await fixture.componentInstance.browse();
        fixture.detectChanges();
        expect(fetchMock).toHaveBeenCalledWith('/api/games/endfield/images');
        const button = fixture.nativeElement.querySelector('.image-library button') as HTMLButtonElement;
        button.click();
        expect(fixture.componentInstance.value()).toBe(image.url);
        expect(fixture.componentInstance.open()).toBe(false);
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
        expect(fetchMock).toHaveBeenCalledWith('/api/games/endfield/images?name=Banner.PNG', expect.objectContaining({ headers: { 'Content-Type': 'image/png' }, body: file }));
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
