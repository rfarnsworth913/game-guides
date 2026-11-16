import { afterNextRender, Component, ElementRef, inject, Injector, input, OnInit, output, signal, viewChild } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { defaultGameOverview, GAME_FEATURES, gameColorHex, gameOverviewErrors, normalizeGameColor, type GameOverviewField } from '@common/workspace/game-overview';
import type { GameFeature, GameOverview } from '@lib/types/game-overview.type';
import { WorkspaceStore } from '../../../../core/state/workspace.store';
import { DialogFocusDirective } from '../../../../shared/directives/dialog-focus/dialog-focus';
import { GameImagePicker } from '../../../../shared/components/image-selector/game-image-picker';

export type GameManagementRequest = { action: 'add' | 'edit' | 'list'; id?: string };
type EditorTab = 'overview' | 'advanced';

@Component({
    selector: 'gg-game-manager',
    imports: [FormsModule, DialogFocusDirective, GameImagePicker],
    templateUrl: './game-manager.html',
    styleUrl: './game-manager.scss',
})
export class GameManager implements OnInit {
    readonly store = inject(WorkspaceStore);
    private readonly document = inject(DOCUMENT);
    private readonly injector = inject(Injector);
    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
    readonly iconPicker = viewChild<GameImagePicker>('iconPicker');
    readonly bannerPicker = viewChild<GameImagePicker>('bannerPicker');
    readonly request = input.required<GameManagementRequest>();
    readonly closed = output<void>();
    readonly registry = signal<GameOverview[]>([]);
    readonly loading = signal(true);
    readonly registryLoaded = signal(false);
    readonly saving = signal(false);
    readonly tab = signal<EditorTab>('overview');
    readonly error = signal('');
    readonly features = [...GAME_FEATURES].sort((a, b) => a.title.localeCompare(b.title));
    readonly gameTypes = ['RPG', 'JRPG', 'Action RPG', 'MMORPG', 'Adventure', 'Strategy', 'Gacha', 'Other'].sort((a, b) => a.localeCompare(b));
    draft: GameOverview | null = null;
    creating = false;
    confirmRemove = false;
    idEdited = false;
    shortEdited = false;
    submitted = false;
    readonly touched = new Set<GameOverviewField>();

    ngOnInit(): void {this.retry();}
    retry(): void {this.load().catch(() => this.error.set('Could not load games.'));}
    private async load(): Promise<void> {
        this.loading.set(true);
        this.error.set('');
        try {
            this.registry.set(await this.store.gameRegistry());
            this.registryLoaded.set(true);
            const request = this.request();
            if (request.action === 'add') {this.add();}
            if (request.action === 'edit') {
                const game = this.registry().find(item => item.id === request.id);
                if (game) {this.edit(game);} else {this.error.set('This game is no longer available. Reload the list.');}
            }
        } catch (error) {this.error.set(error instanceof Error ? error.message : 'Could not load games.');}
        finally {this.loading.set(false);}
    }
    private resetForm(): void {
        this.confirmRemove = false;
        this.submitted = false;
        this.touched.clear();
        this.tab.set('overview');
        this.error.set('');
    }
    add(): void {
        if (this.busy()) {return;}
        this.creating = true;
        this.draft = { ...defaultGameOverview(''), name: '', short: '', features: [] };
        this.idEdited = false;
        this.shortEdited = false;
        this.resetForm();
    }
    edit(game: GameOverview): void {
        if (this.busy()) {return;}
        this.creating = false;
        this.draft = { ...structuredClone(game), description: game.description || game.subtitle };
        this.resetForm();
    }
    setTitle(name: string): void {
        if (!this.draft) {return;}
        this.draft.name = name;
        if (this.creating && !this.idEdited) {
            const slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 59).replace(/-$/, '');
            const id = slug ? (/^[a-z]/.test(slug) ? slug : 'game-' + slug) : name.trim() ? this.draft.id || 'game-' + crypto.randomUUID().slice(0, 8) : '';
            this.setId(id);
        }
        if (this.creating && !this.shortEdited) {this.draft.short = name.trim().split(/\s+/).map(word => Array.from(word)[0] ?? '').join('').slice(0, 8).toUpperCase();}
    }
    setId(id: string): void {
        if (!this.draft) {return;}
        const useDefault = this.draft.color === defaultGameOverview(this.draft.id).color;
        this.draft.id = id;
        if (useDefault) {this.draft.color = defaultGameOverview(id).color;}
    }
    toggleFeature(id: GameFeature): void {
        if (!this.draft) {return;}
        this.draft.features = this.draft.features.includes(id) ? this.draft.features.filter(item => item !== id) : [...this.draft.features, id];
    }
    errors(): Partial<Record<GameOverviewField, string>> {
        const errors = gameOverviewErrors(this.draft);
        if (this.creating && this.draft && this.registry().some(game => game.id === this.draft!.id)) {errors.id = 'This game ID already exists. Edit or restore that game, or choose another ID in Advanced.';}
        return errors;
    }
    errorEntries(): { field: GameOverviewField; message: string }[] {
        return Object.entries(this.errors()).map(([field, message]) => ({ field: field as GameOverviewField, message }));
    }
    showErrors(): boolean {return this.submitted || this.touched.size > 0;}
    fieldError(field: GameOverviewField): string {return this.showErrors() ? this.errors()[field] ?? '' : '';}
    valid(): boolean {return !!this.draft && Object.keys(this.errors()).length === 0;}
    busy(): boolean {return this.saving() || this.store.saving() || !!this.iconPicker()?.uploading() || !!this.bannerPicker()?.uploading();}
    selectTab(tab: EditorTab, focus = false): void {
        this.tab.set(tab);
        if (focus) {afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('[role=tab][aria-selected=true]')?.focus(), { injector: this.injector });}
    }
    tabKey(event: KeyboardEvent): void {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {return;}
        event.preventDefault();
        this.selectTab(event.key === 'Home' ? 'overview' : event.key === 'End' ? 'advanced' : this.tab() === 'overview' ? 'advanced' : 'overview', true);
    }
    focusError(field: GameOverviewField): void {
        this.selectTab(field === 'id' || field === 'short' ? 'advanced' : 'overview');
        afterNextRender(() => {
            const names: Partial<Record<GameOverviewField, string>> = { name: 'title', id: 'id', short: 'short', gameType: 'type', description: 'description', color: 'color' };
            const target = names[field] ? this.host.nativeElement.querySelector<HTMLElement>('[name=game-' + names[field] + ']') :
                this.host.nativeElement.querySelector<HTMLElement>('[data-game-field=' + field + '] input[type=text]');
            const details = target?.closest('details');
            if (details) {details.open = true;}
            target?.focus();
        }, { injector: this.injector });
    }
    colorText(): string {
        const color = this.draft?.color ?? '';
        if (normalizeGameColor(color)) {return color;}
        const variable = /^var\((--[a-z0-9-]+)\)$/.exec(color);
        if (!variable || color !== defaultGameOverview(this.draft?.id ?? '').color) {return color;}
        const computed = this.document.defaultView?.getComputedStyle(this.document.documentElement).getPropertyValue(variable[1]).trim() ?? '';
        return normalizeGameColor(computed) ?? color;
    }
    colorHex(): string {return gameColorHex(this.colorText()) ?? '#000000';}
    setColor(color: string): void {if (this.draft) {this.draft.color = color; this.touched.add('color');}}
    resetColor(): void {if (this.draft) {this.draft.color = defaultGameOverview(this.draft.id).color;}}
    previewColor(): string | null {return this.errors().color ? null : this.draft?.color ?? null;}
    close(): void {if (!this.busy()) {this.closed.emit();}}
    cancelEdit(): void {if (!this.busy()) {this.draft = null; this.error.set('');}}
    private rememberSaved(game: GameOverview): void {
        this.registry.update(games => [...games.filter(item => item.id !== game.id), game].sort((a, b) => a.name.localeCompare(b.name)));
    }
    async save(remove = false, restore = false): Promise<void> {
        if (!this.draft || this.busy() || !this.store.canEdit() || (remove && !this.confirmRemove)) {return;}
        this.submitted = true;
        if (!remove && !this.valid()) {this.focusError(this.errorEntries()[0]?.field ?? 'name'); return;}
        this.error.set('');
        this.saving.set(true);
        let created = false;
        let restored = false;
        try {
            if (remove) {
                const original = this.registry().find(game => game.id === this.draft!.id);
                if (!original) {throw new Error('Reload the game list before removing this game.');}
                this.rememberSaved(await this.store.saveGameOverview(original, false, true));
            } else {
                let working = this.draft;
                const pendingUploads = !!this.iconPicker()?.pendingFile() || !!this.bannerPicker()?.pendingFile();
                if (this.creating) {
                    working = await this.store.saveGameOverview(working, true);
                    this.creating = false;
                    this.draft = working;
                    this.rememberSaved(working);
                    created = true;
                } else if (restore && working.archived) {
                    working = await this.store.saveGameOverview({ ...working, archived: false });
                    this.draft = working;
                    this.rememberSaved(working);
                    restored = true;
                }
                working.icon = await this.iconPicker()?.commitPendingUpload() ?? working.icon;
                working.banner = await this.bannerPicker()?.commitPendingUpload() ?? working.banner;
                if ((!created && !restored) || pendingUploads) {this.rememberSaved(await this.store.saveGameOverview(working));}
            }
            this.draft = null;
            this.confirmRemove = false;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Could not save the game.';
            this.error.set(created || restored ? 'The game was ' + (created ? 'created' : 'restored') + ', but some changes could not be saved. Retry here without creating another game. ' + message : message);
        } finally {this.saving.set(false);}
    }
}
