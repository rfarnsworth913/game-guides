import { TestBed } from '@angular/core/testing';
import { DashboardArtwork } from './dashboard-artwork';

describe('Dashboard artwork loading', () => {
    it('shows a loader until the image loads, fades in the image and restarts for a new source', () => {
        const fixture = TestBed.createComponent(DashboardArtwork), root = fixture.nativeElement as HTMLElement;
        fixture.componentRef.setInput('src', '/first.webp'); fixture.detectChanges();
        expect(root.querySelector('.loading-layer')?.classList.contains('visible')).toBe(true);
        root.querySelector('img')!.dispatchEvent(new Event('load')); fixture.detectChanges();
        expect(root.querySelector('img')?.classList.contains('loaded')).toBe(true);
        expect(root.querySelector('.loading-layer')?.getAttribute('aria-hidden')).toBe('true');
        fixture.componentRef.setInput('src', '/second.webp'); fixture.detectChanges();
        expect(fixture.componentInstance.loading()).toBe(true);
        expect(root.querySelector('img')?.classList.contains('loaded')).toBe(false);
    });
    it('settles failed and missing images without an endless loading indicator', () => {
        const fixture = TestBed.createComponent(DashboardArtwork), root = fixture.nativeElement as HTMLElement;
        fixture.detectChanges(); expect(fixture.componentInstance.loading()).toBe(false);
        fixture.componentRef.setInput('src', '/missing.webp'); fixture.detectChanges();
        root.querySelector('img')!.dispatchEvent(new Event('error')); fixture.detectChanges();
        expect(fixture.componentInstance.loading()).toBe(false);
        expect(root.querySelector('img')).toBeNull();
        expect(root.querySelector('.loading-layer')?.getAttribute('aria-hidden')).toBe('true');
    });
});
