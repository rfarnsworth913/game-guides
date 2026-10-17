import { inject } from '@angular/core';
import { AuthStore } from './auth.store';
import { Component, computed, ElementRef, input, model, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { storyImageUrl } from '../../../../common/story-template';

import { GameImage, ImageCategory, friendlyImageName } from '../../../../common/game-images';

@Component({
    selector: 'gg-game-image-picker',
    imports: [FormsModule],
    templateUrl: './game-image-picker.html',
    styleUrl: './game-image-picker.scss',
})
export class GameImagePicker {
    private readonly auth = inject(AuthStore);
    readonly game = input.required<string>();
    readonly label = input.required<string>();
    readonly value = model('');
    readonly banner = input(false);
    readonly compact = input(false);
    readonly iconMenuId = `icon-menu-${crypto.randomUUID()}`;
    readonly iconMenu = viewChild<ElementRef<HTMLElement>>('iconMenu');
    readonly iconDraft = signal('');
    readonly description = model('');
    readonly sourceName = model('');
    readonly sourceUrl = model('');
    readonly positionX = model(50);
    readonly positionY = model(50);
    readonly library = viewChild<ElementRef<HTMLDialogElement>>('library');
    readonly pending = signal<GameImage | null>(null);
    readonly search = signal('');
    readonly filter = signal('');
    readonly dimensions = signal<Record<string, { width: number; height: number }>>({});
    readonly title = signal('');
    readonly category = signal<ImageCategory>('banner');
    readonly tags = signal('');
    readonly savingDetails = signal(false);
    readonly message = signal('');
    readonly friendlyName = friendlyImageName;
    readonly filteredImages = computed(() => this.images().filter((image) => {
        const words = [image.name, image.details?.title, image.details?.tags, image.details?.description, this.kind(image)].join(' ').toLowerCase();
        return words.includes(this.search().trim().toLowerCase()) && (!this.filter() || this.kind(image) === this.filter());
    }));
    readonly images = signal<GameImage[]>([]);
    readonly open = signal(false);
    readonly loading = signal(false);
    readonly uploading = signal(false);
    readonly error = signal('');
    readonly failedPreview = signal('');
    readonly imageUrl = storyImageUrl;
    showIconMenu(event: Event): void {
        this.iconDraft.set(this.value());
        const menu = this.iconMenu()?.nativeElement;
        if (!menu) return;
        const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
        menu.style.left = `${Math.max(8, Math.min(bounds.right - 280, window.innerWidth - 296))}px`;
        menu.style.top = `${Math.max(8, Math.min(bounds.bottom + 8, window.innerHeight - 330))}px`;
        menu.showPopover();
    }
    closeIconMenu(): void { this.iconMenu()?.nativeElement.hidePopover?.(); }
    useIconDraft(): void {
        this.value.set(this.iconDraft().trim());
        this.failedPreview.set('');
        this.closeIconMenu();
    }
    selectImage(image: GameImage): void {
        this.pending.set({ ...image, details: { ...image.details } });
    }
    async savePendingDetails(): Promise<void> {
        const image = this.pending();
        if (!image) return;
        this.savingDetails.set(true);
        this.error.set('');
        try {
            const response = await this.auth.request(image.url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(image.details ?? {}) });
            const result = await response.json() as GameImage & { error?: string };
            if (!response.ok) throw new Error(result.error || 'Could not save image details.');
            this.images.update((images) => images.map((item) => item.url === result.url ? result : item));
            this.pending.set(result);
            this.message.set('Library image details saved.');
        } catch (error) { this.error.set(error instanceof Error ? error.message : 'Could not save image details.'); }
        finally { this.savingDetails.set(false); }
    }
    preventLibrarySubmit(event: Event): void {
        if ((event.target as HTMLElement).tagName === 'INPUT') event.preventDefault();
        event.stopPropagation();
    }

    displayName(image: GameImage): string { return image.details?.title || friendlyImageName(image.name); }
    currentName(): string {
        const image = this.images().find((item) => item.url === this.value());
        return image ? this.displayName(image) : friendlyImageName(this.value().split('/').at(-1)?.split('?')[0] || 'Image');
    }
    size(image: GameImage) { return this.dimensions()[image.url] ?? image.details; }
    kind(image: GameImage): string {
        if (image.details?.category) return image.details.category;
        const size = this.size(image);
        if (!size?.width || !size.height) return '';
        const ratio = size.width / size.height;
        return ratio >= 2.7 ? 'banner' : ratio < .9 ? 'character' : ratio < 1.2 ? 'icon' : 'landscape';
    }
    matchesBanner(image: GameImage): boolean {
        const size = this.size(image);
        return !!size?.width && !!size.height && Math.abs(size.width / size.height - 3) < .15;
    }
    recordSize(event: Event, url: string): void {
        const image = event.target as HTMLImageElement;
        this.dimensions.update((sizes) => ({ ...sizes, [url]: { width: image.naturalWidth, height: image.naturalHeight } }));
    }
    cancelLibrary(): void {
        this.library()?.nativeElement.close?.();
        this.open.set(false);
        this.pending.set(null);
    }
    useSelected(): void {
        const image = this.pending();
        if (!image) return;
        this.value.set(image.url);
        this.description.set(image.details?.description ?? '');
        this.sourceName.set(image.details?.sourceName ?? '');
        this.sourceUrl.set(image.details?.sourceUrl ?? '');
        this.title.set(this.displayName(image));
        this.category.set((image.details?.category || this.kind(image) || (this.banner() ? 'banner' : 'landscape')) as ImageCategory);
        this.tags.set(image.details?.tags ?? '');
        this.positionX.set(50);
        this.positionY.set(50);
        this.failedPreview.set('');
        this.cancelLibrary();
    }
    async saveDetails(): Promise<void> {
        if (!this.value().startsWith(`/api/games/${this.game()}/images/`)) return;
        this.savingDetails.set(true);
        this.error.set('');
        this.message.set('');
        try {
            const details = { title: this.title().trim() || this.currentName(), category: this.category(), tags: this.tags().trim(),
                description: this.description().trim(), sourceName: this.sourceName().trim(), sourceUrl: this.sourceUrl().trim(),
                ...this.dimensions()[this.value()] };
            const response = await this.auth.request(this.value(), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(details) });
            const result = await response.json() as GameImage & { error?: string };
            if (!response.ok) throw new Error(result.error || 'Could not save library details.');
            this.images.update((images) => [...images.filter((image) => image.url !== result.url), result]);
            this.message.set('Image details saved to the game library.');
        } catch (error) { this.error.set(error instanceof Error ? error.message : 'Could not save library details.'); }
        finally { this.savingDetails.set(false); }
    }

    async browse(): Promise<void> {
        this.closeIconMenu();
        this.open.set(true);
        this.pending.set(null);
        this.search.set('');
        this.filter.set('');
        this.library()?.nativeElement.showModal?.();
        this.loading.set(true);
        this.error.set('');
        try {
            const response = await this.auth.request(`/api/games/${this.game()}/images`);
            if (!response.ok) throw new Error('Could not load images. Please try again.');
            const result = await response.json() as { images: GameImage[] };
            this.images.set(result.images);
            const selected = result.images.find((image) => image.url === this.value());
            if (selected) this.selectImage(selected);
        } catch (error) {
            this.error.set(error instanceof Error ? error.message : 'Could not load images.');
        } finally {
            this.loading.set(false);
        }
    }

    async upload(event: Event): Promise<void> {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;
        input.value = '';
        this.error.set('');
        if (file.size > 10 * 1024 * 1024) {
            this.error.set('Images must be 10 MB or smaller.');
            return;
        }
        const extension = file.name.split('.').at(-1)?.toLowerCase();
        const types: Record<string, string> = {
            png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
        };
        // Browser file metadata can be empty or use a platform-specific MIME alias.
        const contentType = types[extension ?? ''] ?? file.type.toLowerCase();
        if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(contentType)) {
            this.error.set('Choose a PNG, JPEG, WebP, or GIF image.');
            return;
        }
        this.uploading.set(true);
        try {
            const response = await this.auth.request(`/api/games/${this.game()}/images?name=${encodeURIComponent(file.name)}`, {
                method: 'POST',
                headers: { 'Content-Type': contentType },
                body: file,
            });
            const result = await response.json() as GameImage & { error?: string };
            if (!response.ok) throw new Error(result.error || 'Could not upload image.');
            this.value.set(result.url);
            this.title.set(friendlyImageName(file.name));
            this.category.set(this.compact() ? 'icon' : this.banner() ? 'banner' : 'landscape');
            this.description.set('');
            this.sourceName.set('');
            this.sourceUrl.set('');
            this.tags.set('');
            this.positionX.set(50);
            this.positionY.set(50);
            this.images.update((images) => [...images, result]);
            this.failedPreview.set('');
            this.closeIconMenu();
            if (this.open()) await this.browse();
        } catch (error) {
            this.error.set(error instanceof Error ? error.message : 'Could not upload image. Please try again.');
        } finally {
            this.uploading.set(false);
        }
    }
}
