import { TestBed } from '@angular/core/testing';
import { PatchOverviewTemplate } from './patch-overview';
import { WorkspaceStore, type Entry } from '../../../../../../core/state/workspace.store';
import { emptyPatchOverview } from '../../../../../../../../../common/quests/story-template';

describe('Character story profile', () => {
    it.each(['character-information','side-stories'])('edits and renders a linked content-group title in %s without changing row tracking', async category => {
        const save=vi.fn();
        TestBed.configureTestingModule({providers:[{provide:WorkspaceStore,useValue:{save,saving:()=>false,loading:()=>false}}]});
        const data={...emptyPatchOverview(),groups:[{id:'lore',title:'Official Lore',groupType:'content' as const,contentUrl:''}],rows:[{id:'profile',groupId:'lore',content:'Character Profile',contentType:'',patch:'',notes:''}]};
        const entry:Entry={id:'character-story',game:'genshin',kind:'story',category,name:'Character story',notes:'',rarity:1,members:[],requirements:[],order:0,day:'',completed:false,quantity:0,target:0,...(category==='character-information'?{characterInformation:data}:{sideStories:data}),storyRowCompletion:{profile:true}};
        const fixture=TestBed.createComponent(PatchOverviewTemplate);
        fixture.componentRef.setInput('entry',entry);fixture.componentRef.setInput('editing',true);fixture.detectChanges();await fixture.whenStable();
        const root=fixture.nativeElement as HTMLElement;
        const label=[...root.querySelectorAll('label')].find(label=>label.textContent?.trim()==='Group Title Link')!;
        const input=label.querySelector('input')!;
        input.value='https://example.com/character-story';input.dispatchEvent(new Event('input'));fixture.detectChanges();
        expect(data.groups[0].contentUrl).toBe('https://example.com/character-story');
        fixture.componentRef.setInput('editing',false);fixture.detectChanges();
        const link=root.querySelector<HTMLAnchorElement>('.patch-group-heading h4 a')!;
        expect(link.textContent).toBe('Official Lore');expect(link.getAttribute('href')).toBe('https://example.com/character-story');
        expect(link.target).toBe('_blank');expect(link.rel).toContain('noopener');
        expect(root.querySelector<HTMLInputElement>('.guide-row-tracking input')?.checked).toBe(true);
        expect(entry.storyRowCompletion).toEqual({profile:true});expect(save).not.toHaveBeenCalled();
    });
    it('presents existing character metadata and artwork while retaining content rows, links and tracking', () => {
        const save = vi.fn();
        TestBed.configureTestingModule({ providers: [{ provide: WorkspaceStore, useValue: { save, saving: () => false, loading: () => false } }] });
        const data = { ...emptyPatchOverview(), characterName: 'Endministrator', damageType: 'Physical', faction: 'Endfield Industries',
            summary: 'An **operator** profile.', patchVersion: '1.0', imageUrl: 'https://example.com/operator.webp', sourceName: 'Official artwork', sourceUrl: 'https://example.com/art',
            groups: [{ id: 'lore', title: 'Official Lore' }], rows: [{ id: 'profile', groupId: 'lore', content: 'Operator Profile', contentUrl: 'https://example.com/profile', contentType: '', patch: '1.0', notes: 'Existing notes' }] };
        const entry: Entry = { id: 'operator', game: 'endfield', kind: 'story', category: 'character-information', name: 'Operator', notes: '', rarity: 1, members: [], requirements: [], order: 0, day: '', completed: false, quantity: 0, target: 0, characterInformation: data, storyRowCompletion: { profile: true } };
        const before = structuredClone(data);
        const fixture = TestBed.createComponent(PatchOverviewTemplate);
        fixture.componentRef.setInput('entry', entry); fixture.detectChanges();
        const root = fixture.nativeElement as HTMLElement;
        expect(root.querySelector('.character-info-header h3')?.textContent).toBe('Endministrator');
        expect(root.querySelector('.character-info-subtitle')?.textContent).toContain('Physical');
        expect(root.querySelector('.character-info-subtitle')?.textContent).toContain('Endfield Industries');
        expect(root.querySelector('.character-profile-summary strong')?.textContent).toBe('operator');
        expect(root.querySelector('.character-introduced')?.textContent).toContain('Patch 1.0');
        expect(root.querySelector('.character-profile-art img')?.getAttribute('src')).toBe(data.imageUrl);
        expect(root.querySelector('.character-profile-art .patch-source a')?.getAttribute('href')).toBe(data.sourceUrl);
        expect(root.querySelector('.guide-row-title a')?.getAttribute('href')).toBe('https://example.com/profile');
        expect(root.querySelectorAll('.guide-content-row')).toHaveLength(1);
        expect(root.querySelector<HTMLInputElement>('.guide-row-tracking input')?.checked).toBe(true);
        expect(root.querySelector('.patch-media-panel')).toBeNull();
        expect(root.querySelector('.character-info-portrait')).toBeNull();
        expect(root.querySelector('.patch-reading-view .patch-group-heading')).not.toBeNull();
        expect(root.querySelector('.patch-group-count strong')?.textContent).toBe('1 / 1');
        expect(root.querySelector('.patch-group-count small')?.textContent).toBe('100%');
        expect(data).toEqual(before); expect(save).not.toHaveBeenCalled();
        root.querySelector('.character-profile-art img')!.dispatchEvent(new Event('error')); fixture.detectChanges();
        expect(root.querySelector('.character-profile-art')).toBeNull();
        expect(root.querySelector('.character-info-header h3')?.textContent).toBe('Endministrator');
        expect(root.querySelectorAll('.guide-content-row')).toHaveLength(1);
    });
});
