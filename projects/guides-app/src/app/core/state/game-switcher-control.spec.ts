import { TestBed } from '@angular/core/testing';
import { GameSwitcherControl } from './game-switcher-control';

describe('Global game switcher control', () => {
    afterEach(() => document.body.replaceChildren());

    it('resets search synchronously on reopening and restores keyboard focus', () => {
        const trigger = document.createElement('button');
        document.body.append(trigger);
        trigger.focus();
        const control = TestBed.inject(GameSwitcherControl);
        control.open();
        control.query.set('star rail');
        control.selected.set(3);
        control.close();
        expect(document.activeElement).toBe(trigger);
        control.open();
        expect(control.query()).toBe('');
        expect(control.selected()).toBe(0);
        control.query.set('hsr');
        control.open();
        expect(control.query()).toBe('hsr');
    });

    it('does not interrupt an existing editor dialog', () => {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        const dialog = document.createElement('section');
        dialog.setAttribute('role', 'dialog');
        backdrop.append(dialog);
        document.body.append(backdrop);
        const control = TestBed.inject(GameSwitcherControl);
        control.open();
        expect(control.opened()).toBe(false);
    });

    it('can reopen before the previous switcher DOM has finished closing', () => {
        const control = TestBed.inject(GameSwitcherControl);
        control.open();
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        const dialog = document.createElement('section');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('data-game-switcher', '');
        backdrop.append(dialog);document.body.append(backdrop);
        control.close();control.open();
        expect(control.opened()).toBe(true);
    });
});
