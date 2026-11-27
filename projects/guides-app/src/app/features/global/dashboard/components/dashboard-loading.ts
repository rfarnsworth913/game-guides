import { Component, input } from '@angular/core';

@Component({ selector: 'gg-dashboard-loading', template: `<span role="status" [attr.aria-label]="label()"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 9 9" /></svg></span>`, styles: `
    :host {display:inline-flex;width:24px;height:24px;color:var(--color-info)}
    span,svg {display:block;width:100%;height:100%} svg {fill:none;stroke:currentColor;stroke-width:2;animation:spin 900ms linear infinite}
    circle {opacity:.2} path {stroke-linecap:round} @keyframes spin {to{transform:rotate(360deg)}}
    @media(prefers-reduced-motion:reduce){svg{animation:none}}
` })
export class DashboardLoading {readonly label = input('Loading content');}
