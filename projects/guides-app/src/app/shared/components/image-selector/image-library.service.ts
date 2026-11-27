import { Injectable, effect, inject } from '@angular/core';
import type { GameImage } from '@lib/types/game-image.type';
import { AuthStore } from '../../../core/auth/auth.store';

/** Short-lived list cache; original files and metadata remain in the existing image API. */
@Injectable({ providedIn: 'root' })
export class ImageLibraryService {
    private readonly auth = inject(AuthStore);
    private readonly cache = new Map<string, { expires: number; result: Promise<GameImage[]> }>();
    constructor() { effect(() => { this.auth.user(); this.cache.clear(); }); }
    invalidate(game: string): void { this.cache.delete(game); }
    list(game: string, refresh = false): Promise<GameImage[]> {
        const cached = this.cache.get(game);
        if (!refresh && cached && cached.expires > Date.now()) { return cached.result; }
        const result = this.load(game);
        this.cache.set(game, { expires: Date.now() + 60_000, result });
        return result;
    }
    private async load(game: string): Promise<GameImage[]> {
        try {
            const response = await this.auth.request(`/api/games/${game}/images`);
            if (!response.ok) { throw new Error('Could not load images. Please try again.'); }
            const data = await response.json() as { images?: GameImage[] };
            if (!Array.isArray(data.images)) { throw new Error('Invalid image library response.'); }
            return data.images;
        } catch (error) { this.cache.delete(game); throw error; }
    }
}
