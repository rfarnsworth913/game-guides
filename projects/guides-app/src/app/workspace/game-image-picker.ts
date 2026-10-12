import { Component, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { storyImageUrl } from '../../../../common/story-template';

type GameImage = { name: string; url: string };

@Component({
    selector: 'gg-game-image-picker',
    imports: [FormsModule],
    templateUrl: './game-image-picker.html',
    styleUrl: './game-image-picker.scss',
})
export class GameImagePicker {
    readonly game = input.required<string>();
    readonly label = input.required<string>();
    readonly value = model('');
    readonly images = signal<GameImage[]>([]);
    readonly open = signal(false);
    readonly loading = signal(false);
    readonly uploading = signal(false);
    readonly error = signal('');
    readonly failedPreview = signal('');
    readonly imageUrl = storyImageUrl;

    async browse(): Promise<void> {
        this.open.set(true);
        this.loading.set(true);
        this.error.set('');
        try {
            const response = await fetch(`/api/games/${this.game()}/images`);
            if (!response.ok) throw new Error('Could not load images. Please try again.');
            const result = await response.json() as { images: GameImage[] };
            this.images.set(result.images);
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
            const response = await fetch(`/api/games/${this.game()}/images?name=${encodeURIComponent(file.name)}`, {
                method: 'POST',
                headers: { 'Content-Type': contentType },
                body: file,
            });
            const result = await response.json() as GameImage & { error?: string };
            if (!response.ok) throw new Error(result.error || 'Could not upload image.');
            this.value.set(result.url);
            this.failedPreview.set('');
            if (this.open()) await this.browse();
        } catch (error) {
            this.error.set(error instanceof Error ? error.message : 'Could not upload image. Please try again.');
        } finally {
            this.uploading.set(false);
        }
    }
}
