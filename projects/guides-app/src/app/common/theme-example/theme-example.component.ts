import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../services/theme.service';

import { Theme } from "@lib/types";

/**
 * Example component demonstrating how to use the theme system.
 * This serves as a reference for implementing theming in your own components.
 */
@Component({
  selector: 'gg-theme-example',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="example-container">
      <section class="example-card">
        <h2>Theme System Example</h2>

        <div class="info-box">
          <p>Current Theme: <strong>{{ currentTheme }}</strong></p>
          <button class="btn" (click)="toggleTheme()">Toggle Theme</button>
        </div>

        <div class="color-preview">
          <h3>Color Palette Preview</h3>
          <div class="color-grid">
            <div class="color-swatch" [style.background-color]="'var(--color-primary)'">
              <span>Primary</span>
            </div>
            <div class="color-swatch" [style.background-color]="'var(--color-bg-secondary)'">
              <span>Secondary BG</span>
            </div>
            <div class="color-swatch" [style.background-color]="'var(--color-success)'">
              <span>Success</span>
            </div>
            <div class="color-swatch" [style.background-color]="'var(--color-error)'">
              <span>Error</span>
            </div>
          </div>
        </div>

        <div class="usage-info">
          <h3>How to Use Themes</h3>
          <p>In your component styles, use CSS custom properties:</p>
          <code>.my-element {{ '{' }}
  background-color: var(--color-bg-primary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
{{ '}' }}</code>
        </div>
      </section>
    </div>
  `,
  styles: `
    .example-container {
      padding: 2rem;
      max-width: 800px;
      margin: 0 auto;
    }

    .example-card {
      background-color: var(--color-bg-secondary);
      border: 1px solid var(--color-border);
      border-radius: 8px;
      padding: 2rem;
      box-shadow: 0 1px 3px var(--color-shadow);

      h2 {
        margin-top: 0;
        color: var(--color-text-primary);
      }

      h3 {
        color: var(--color-text-primary);
        margin-top: 1.5rem;
        margin-bottom: 1rem;
      }
    }

    .info-box {
      background-color: var(--color-bg-primary);
      border: 1px solid var(--color-border);
      border-radius: 6px;
      padding: 1rem;
      margin-bottom: 1.5rem;

      p {
        margin: 0 0 1rem 0;
        color: var(--color-text-primary);
      }
    }

    .btn {
      background-color: var(--color-primary);
      color: white;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 4px;
      font-size: 1rem;
      cursor: pointer;
      transition: background-color 0.2s ease;

      &:hover {
        background-color: var(--color-primary-light);
      }

      &:active {
        background-color: var(--color-primary-dark);
      }
    }

    .color-preview {
      margin: 1.5rem 0;
    }

    .color-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 1rem;
    }

    .color-swatch {
      border-radius: 6px;
      height: 80px;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      padding: 0.5rem;
      border: 1px solid var(--color-border);
      font-weight: 600;
      font-size: 0.85rem;

      span {
        color: var(--color-text-primary);
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
        background: rgba(255, 255, 255, 0.1);
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
      }
    }

    .usage-info {
      background-color: var(--color-bg-primary);
      border-left: 4px solid var(--color-primary);
      padding: 1rem;
      border-radius: 4px;
      margin-top: 1.5rem;

      p {
        margin: 0 0 0.5rem 0;
        color: var(--color-text-secondary);
      }

      code {
        display: block;
        background-color: var(--color-bg-secondary);
        color: var(--color-text-primary);
        padding: 1rem;
        border-radius: 4px;
        overflow-x: auto;
        font-family: 'Courier New', monospace;
        font-size: 0.85rem;
        line-height: 1.5;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeExampleComponent {
  private readonly themeService = inject(ThemeService);

  get currentTheme(): Theme {
    return this.themeService.getTheme();
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }
}
