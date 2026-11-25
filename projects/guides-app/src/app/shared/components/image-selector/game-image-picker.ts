import { inject, Component, computed, DestroyRef, effect, ElementRef, input, model, signal, viewChild } from '@angular/core';
import { AuthStore } from "../../../core/auth/auth.store";

import { FormsModule } from '@angular/forms';
import { storyImageUrl } from "@common/quests/story-template";

import type { GameImage, ImageCategory } from "@lib/types/game-image.type";
import { friendlyImageName } from "@common/images/game-images";
import { imageRecommendations } from "@lib/constants/image-recommendations.constants";
import { IMAGE_CATEGORIES } from '@lib/constants/image-category.constants';
import { fileSizeLabel, imageAspect, imageCategories, imageFormat, libraryImageCategories, libraryImageCategory, type ImageSort } from './image-library';
import { ImageLibraryService } from './image-library.service';

@Component({
    selector: 'gg-game-image-picker',
    imports: [FormsModule],
    templateUrl: "./game-image-picker.html",
    styleUrls: ["./game-image-picker.scss", "./game-image-preview.scss", "./image-library-card.scss", "./image-library.scss", "./image-library-preview.scss"],
})
export class GameImagePicker {
    private readonly auth = inject(AuthStore);
    private readonly libraryService = inject(ImageLibraryService);
    private readonly destroyRef = inject(DestroyRef);
    readonly game = input.required<string>();
    readonly label = input.required<string>();
    readonly value = model('');
    readonly banner = input(false);
    readonly previewOverlay = input(false);
    readonly compact = input(false);
    readonly imagePurpose = input<keyof typeof imageRecommendations>();
    readonly preferredImageType = input<ImageCategory>();
    readonly allowedImageTypes = input<readonly ImageCategory[]>();
    readonly allowOtherAspectRatios = input(true);
    readonly recommendedDimensions = computed(() => imageRecommendations[
        this.imagePurpose() ?? (this.compact() ? 'icon' : this.banner() ? 'banner' : 'square')
    ]);
    readonly selectionOnly = input(false);
    readonly deferUploads = input(false);
    readonly libraryAvailable = input(true);
    readonly pendingFile = model<File | null>(null);
    private readonly pendingContentType = signal('');
    private readonly pendingPreview = signal('');
    readonly previewUrl = computed(() => this.pendingPreview() || storyImageUrl(this.value()));
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
    readonly query = signal('');
    readonly filter = signal('');
    readonly sort = signal<ImageSort>('name-asc');
    readonly pageSize = 48;
    readonly visibleCount = signal(this.pageSize);
    readonly grid = viewChild<ElementRef<HTMLElement>>('imageGrid');
    readonly previewDialog = viewChild<ElementRef<HTMLDialogElement>>('imagePreview');
    readonly previewImage = signal<GameImage | null>(null);
    readonly categories = computed(() => imageCategories.filter(category => !this.allowedImageTypes() || this.allowedImageTypes()!.includes(category.id)));
    readonly preferredCategory = computed<ImageCategory>(() => {
        if (this.preferredImageType()) { return this.preferredImageType()!; }
        const purpose = this.imagePurpose();
        return purpose === 'fullArt' ? 'character' : purpose === 'square' ? 'headshot' : this.compact() || purpose === 'icon' ? 'icon' : this.banner() || purpose === 'banner' || purpose === 'header' || purpose === 'characterBanner' ? 'banner' : 'landscape';
    });
    readonly libraryDescription = computed(() => `Select ${['icon', 'image'].includes(IMAGE_CATEGORIES[this.preferredCategory()].singular) ? 'an' : 'a'} ${IMAGE_CATEGORIES[this.preferredCategory()].singular} · Recommended ${this.recommendedDimensions()}. Other sizes are supported.`);
    readonly validSelection = computed(() => {
        const image = this.pending();
        return !!image && !!storyImageUrl(image.url) && this.images().some(item => item.url === image.url)
            && (!this.allowedImageTypes() || this.allowedImageTypes()!.some(type => libraryImageCategories(image).includes(type)))
            && (this.allowOtherAspectRatios() || this.matchesRecommendation(image));
    });
    private searchTimer?: ReturnType<typeof setTimeout>;
    private loadVersion = 0;
    private scrollTop = 0;
    private readonly used = new Map<string, number>();
    private readonly contexts = new Map<string, { query: string; filter: string; sort: ImageSort; scroll: number; count: number }>();
    private contextKey = '';
    readonly dimensions = signal<Record<string, { width: number; height: number }>>({});
    readonly previewMetadata = computed(() => {
        const url = this.previewUrl();
        const stored = this.images().find(image => image.url === this.value());
        const size = this.dimensions()[url ?? ''] ?? (stored ? this.size(stored) : null);
        const file = this.pendingFile();
        const extension = (file?.name ?? this.value()).split(/[?#]/)[0].split('.').at(-1)?.toUpperCase();
        return [
            size?.width && size.height ? `${size.width} × ${size.height}` : '',
            fileSizeLabel(file?.size ?? stored?.fileSize),
            extension && ['PNG', 'JPG', 'JPEG', 'WEBP', 'GIF'].includes(extension) ? extension === 'WEBP' ? 'WebP' : extension === 'JPG' ? 'JPEG' : extension : '',
        ].filter(Boolean).join(' · ');
    });
    readonly title = signal('');
    readonly category = signal<ImageCategory>('banner');
    readonly tags = signal('');
    readonly savingDetails = signal(false);
    readonly message = signal('');
    readonly friendlyName = friendlyImageName;
    readonly filteredImages = computed(() => this.images().filter((image) => {
        const words = [image.name, this.displayName(image), ...Object.values(image.details ?? {}), this.kind(image)].join(' ').toLowerCase();
        return this.search().trim().toLowerCase().split(/\s+/).every(word => words.includes(word))
            && (!this.filter() || this.kind(image) === this.filter() || libraryImageCategories(image).includes(this.filter() as ImageCategory))
            && (!this.allowedImageTypes() || this.allowedImageTypes()!.some(type => libraryImageCategories(image).includes(type)));
    }).sort((a, b) => {
        const name = this.displayName(a).localeCompare(this.displayName(b), globalThis.undefined, { numeric: true, sensitivity: 'base' }) || a.url.localeCompare(b.url);
        const date = (image: GameImage) => Date.parse(image.createdAt ?? image.updatedAt ?? '') || 0;
        return this.sort() === 'name-desc' ? -name : this.sort() === 'newest' ? date(b) - date(a) || name
            : this.sort() === 'oldest' ? date(a) - date(b) || name : this.sort() === 'recent' ? (this.used.get(b.url) ?? 0) - (this.used.get(a.url) ?? 0) || name : name;
    }));
    readonly visibleImages = computed(() => this.filteredImages().slice(0, this.visibleCount()));
    readonly images = signal<GameImage[]>([]);
    readonly open = signal(false);
    readonly loading = signal(false);
    readonly uploading = signal(false);
    readonly error = signal('');
    readonly failedPreview = signal('');
    readonly imageUrl = storyImageUrl;
    constructor() {
        this.destroyRef.onDestroy(() => { clearTimeout(this.searchTimer); this.loadVersion++; });
        effect(onCleanup => {
            const file = this.pendingFile();
            if (!file) {this.pendingPreview.set(''); return;}
            const url = URL.createObjectURL(file);
            this.pendingPreview.set(url);
            onCleanup(() => URL.revokeObjectURL(url));
        });
    }
    removeImage(): void {
        this.pendingFile.set(null);
        this.value.set('');
        this.failedPreview.set('');
        this.error.set('');
    }
    setImageUrl(value: string): void {
        this.pendingFile.set(null);
        this.value.set(value.trim());
        this.failedPreview.set('');
        this.error.set('');
    }
    showIconMenu(event: Event): void {
        this.iconDraft.set(this.value());
        const menu = this.iconMenu()?.nativeElement;
        if (!menu) {return;}
        const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
        menu.style.left = `${Math.max(8, Math.min(bounds.right - 280, window.innerWidth - 296))}px`;
        menu.style.top = `${Math.max(8, Math.min(bounds.bottom + 8, window.innerHeight - 330))}px`;
        menu.showPopover();
    }
    closeIconMenu(): void { this.iconMenu()?.nativeElement.hidePopover?.(); }
    useIconDraft(): void {
        this.setImageUrl(this.iconDraft());
        this.failedPreview.set('');
        this.closeIconMenu();
    }
    selectImage(image: GameImage): void {
        this.pending.set({ ...image, details: { ...image.details } });
    }
    preventLibrarySubmit(event: Event): void {
        const tag = (event.target as HTMLElement).tagName;
        if (tag !== 'BUTTON' && tag !== 'SELECT') {
            event.preventDefault();
            clearTimeout(this.searchTimer);
            this.search.set(this.query());
            if (this.validSelection()) { this.useSelected(); }
        }
        event.stopPropagation();
    }

    displayName(image: GameImage): string { return image.details?.title || friendlyImageName(image.name); }
    currentName(): string {
        if (this.pendingFile()) {return this.pendingFile()!.name;}
        const image = this.images().find((item) => item.url === this.value());
        return image ? this.displayName(image) : friendlyImageName(this.value().split('/').at(-1)?.split('?')[0] || 'Image');
    }
    size(image: GameImage) { return image.width && image.height ? { width: image.width, height: image.height } : this.dimensions()[image.url] ?? image.details; }
    kind(image: GameImage): ImageCategory { return libraryImageCategory(image, this.dimensions()[image.url]); }
    readonly format = imageFormat;
    readonly fileSize = fileSizeLabel;
    readonly aspect = imageAspect;
    categoryName(image: GameImage): string { return IMAGE_CATEGORIES[this.kind(image)].label; }
    dimensionLabel(image: GameImage): string { const size = this.size(image); return size?.width && size.height ? `${size.width} × ${size.height}` : 'Dimensions unavailable'; }
    matchesRecommendation(image: GameImage): boolean {
        const size = this.size(image);
        if (!size?.width || !size.height) { return false; }
        const [width, height] = this.recommendedDimensions().match(/\d+/g)?.map(Number) ?? [];
        return !!width && !!height && Math.abs(size.width / size.height - width / height) / (width / height) < .08;
    }
    ratioWarning(image: GameImage): boolean {
        if (!this.filter()) { return false; }
        const size = this.size(image);
        const ratio = IMAGE_CATEGORIES[this.filter() as ImageCategory]?.ratio;
        return !!ratio && !!size?.width && !!size.height && Math.abs(size.width / size.height - ratio) / ratio > .08;
    }
    cover(image: GameImage): boolean { return !!this.filter() && IMAGE_CATEGORIES[this.filter() as ImageCategory]?.fit === 'cover' && !this.ratioWarning(image); }
    matchesBanner(image: GameImage): boolean {
        const size = this.size(image);
        return !!size?.width && !!size.height && Math.abs(size.width / size.height - 3) < .15;
    }
    recordSize(event: Event, url: string): void {
        const image = event.target as HTMLImageElement;
        this.dimensions.update((sizes) => ({ ...sizes, [url]: { width: image.naturalWidth, height: image.naturalHeight } }));
    }
    cancelLibrary(): void {
        if (this.contextKey) { this.contexts.set(this.contextKey, { query: this.query(), filter: this.filter(), sort: this.sort(), scroll: this.scrollTop, count: this.visibleCount() }); }
        this.closePreview();
        this.loadVersion++;
        this.loading.set(false);
        this.library()?.nativeElement.close?.();
        this.open.set(false);
        this.pending.set(null);
    }
    useSelected(): void {
        const image = this.pending();
        if (!image || !storyImageUrl(image.url) || (this.allowedImageTypes() && !this.allowedImageTypes()!.some(type => libraryImageCategories(image).includes(type))) || (!this.allowOtherAspectRatios() && !this.matchesRecommendation(image))) {return;}
        this.used.set(image.url, Date.now());
        this.setImageUrl(image.url);
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
        if (!this.value().startsWith(`/api/games/${this.game()}/images/`)) {return;}
        this.savingDetails.set(true);
        this.error.set('');
        this.message.set('');
        try {
            const details = { title: this.title().trim() || this.currentName(), category: this.category(), tags: this.tags().trim(),
                description: this.description().trim(), sourceName: this.sourceName().trim(), sourceUrl: this.sourceUrl().trim(),
                ...this.dimensions()[this.value()] };
            const response = await this.auth.request(this.value(), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(details) });
            const result = await response.json() as GameImage & { error?: string };
            if (!response.ok) {throw new Error(result.error || 'Could not save library details.');}
            this.images.update((images) => [...images.filter((image) => image.url !== result.url), result]);
            this.libraryService.invalidate(this.game());
            this.message.set('Image details saved to the game library.');
        } catch (error) { this.error.set(error instanceof Error ? error.message : 'Could not save library details.'); }
        finally { this.savingDetails.set(false); }
    }

    queueSearch(value: string): void {
        this.query.set(value);
        clearTimeout(this.searchTimer);
        this.searchTimer = setTimeout(() => { this.search.set(value); this.resetGrid(); }, 180);
    }
    setFilter(value: string): void { this.filter.set(value); this.resetGrid(); }
    setSort(value: ImageSort): void { this.sort.set(value); this.resetGrid(); }
    resetGrid(): void { this.visibleCount.set(this.pageSize); this.scrollTop = 0; if (this.grid()) { this.grid()!.nativeElement.parentElement!.scrollTop = 0; } }
    gridScroll(event: Event): void { this.scrollTop = (event.target as HTMLElement).scrollTop; }
    gridKey(event: KeyboardEvent, index: number): void {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) { return; }
        const grid = this.grid()?.nativeElement;
        if (!grid) { return; }
        const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
        const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns };
        const next = Math.max(0, Math.min(this.visibleImages().length - 1, event.key === 'Home' ? 0 : event.key === 'End' ? this.visibleImages().length - 1 : index + steps[event.key]));
        event.preventDefault();
        this.selectImage(this.visibleImages()[next]);
        grid.querySelectorAll<HTMLButtonElement>('.image-select')[next]?.focus();
    }
    showPreview(image: GameImage): void { this.previewImage.set(image); this.previewDialog()?.nativeElement.showModal?.(); }
    closePreview(): void { this.previewDialog()?.nativeElement.close?.(); this.previewImage.set(null); }
    async browse(refresh = false): Promise<void> {
        if (!this.libraryAvailable()) {return;}
        const version = ++this.loadVersion;
        clearTimeout(this.searchTimer);
        this.closeIconMenu();
        this.open.set(true);
        this.pending.set(null);
        this.images.set([]);
        this.contextKey = `${this.game()}/${this.imagePurpose() ?? this.preferredCategory()}/${this.label()}`;
        const context = this.contexts.get(this.contextKey);
        this.query.set(context?.query ?? '');
        this.search.set(context?.query ?? '');
        this.filter.set(context?.filter ?? this.preferredCategory());
        this.sort.set(context?.sort ?? 'name-asc');
        this.visibleCount.set(context?.count ?? this.pageSize);
        this.scrollTop = context?.scroll ?? 0;
        this.library()?.nativeElement.showModal?.();
        this.loading.set(true);
        this.error.set('');
        try {
            const images = await this.libraryService.list(this.game(), refresh);
            if (version !== this.loadVersion || this.destroyRef.destroyed) { return; }
            this.images.set(images);
            const selected = images.find((image) => image.url === this.value());
            if (selected) {this.selectImage(selected);}
            setTimeout(() => { if (this.grid() && version === this.loadVersion) { this.grid()!.nativeElement.parentElement!.scrollTop = this.scrollTop; } }, 0);
        } catch (error) {
            if (version === this.loadVersion) { this.error.set(error instanceof Error ? error.message : 'Could not load images.'); }
        } finally {
            if (version === this.loadVersion) { this.loading.set(false); }
        }
    }

    async upload(event: Event): Promise<void> {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) {return;}
        input.value = '';
        this.error.set('');
        if (!file.size || file.size > 10 * 1024 * 1024) {
            this.error.set('Choose a non-empty image of 10 MB or smaller.');
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
        if (this.deferUploads()) {
            this.pendingContentType.set(contentType);
            this.value.set('');
            this.pendingFile.set(file);
            this.failedPreview.set('');
            this.closeIconMenu();
            return;
        }
        this.uploading.set(true);
        try {
            await this.persistFile(file, contentType);
        } catch (error) {
            this.error.set(error instanceof Error ? error.message : 'Could not upload image. Please try again.');
        } finally {
            this.uploading.set(false);
        }
    }
    async commitPendingUpload(): Promise<string> {
        const file = this.pendingFile();
        if (!file) {return this.value();}
        this.error.set('');
        this.uploading.set(true);
        try {return await this.persistFile(file, this.pendingContentType());}
        catch (error) {
            this.error.set(error instanceof Error ? error.message : 'Could not upload image. Please try again.');
            throw error;
        } finally {this.uploading.set(false);}
    }
    private async persistFile(file: File, contentType: string): Promise<string> {
            const response = await this.auth.request(`/api/games/${this.game()}/images?name=${encodeURIComponent(file.name)}&category=${this.preferredCategory()}`, {
                method: 'POST',
                headers: { 'Content-Type': contentType },
                body: file,
            });
            const result = await response.json() as GameImage & { error?: string };
            if (!response.ok) {throw new Error(result.error || 'Could not upload image.');}
            if (typeof result.url !== 'string' || !result.url.startsWith(`/api/games/${this.game()}/images/`) || !storyImageUrl(result.url)) {throw new Error('Invalid image upload response.');}
            this.value.set(result.url);
            this.pendingFile.set(null);
            this.title.set(friendlyImageName(file.name));
            this.category.set(this.preferredCategory());
            this.description.set('');
            this.sourceName.set('');
            this.sourceUrl.set('');
            this.tags.set('');
            this.positionX.set(50);
            this.positionY.set(50);
            this.images.update((images) => [...images, result]);
            this.libraryService.invalidate(this.game());
            this.failedPreview.set('');
            this.closeIconMenu();
            if (this.open()) {await this.browse();}
            return result.url;
    }
}
