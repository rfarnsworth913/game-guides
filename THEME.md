# Theme System Documentation

This guide explains how to use the custom theme system in the Guides App.

## Overview

The theme system provides a flexible, maintainable way to implement light and dark themes based on GitHub's color scheme. It uses:

- **SCSS CSS Custom Properties (Variables)** for dynamic theme switching
- **Angular Service** for theme state management
- **Modern Angular 21** patterns with signals
- **LocalStorage** for theme persistence

## Architecture

### SCSS Theme Files

Located in `projects/guides-app/styles/themes/`:

- **`_variables.scss`** - Defines the light ($light-theme) and dark ($dark-theme) color palettes
- **`_theme-mixin.scss`** - Provides the `apply-theme()` mixin to convert SCSS maps to CSS custom properties
- **`_light-theme.scss`** - Applies light theme to `:root` and `[data-theme='light']`
- **`_dark-theme.scss`** - Applies dark theme to `:root` and `[data-theme='dark']`

### TypeScript Service

**`ThemeService`** (`src/app/services/theme.service.ts`):
- Manages theme state using Angular signals
- Persists theme preference to localStorage
- Applies theme by setting classes/attributes on the document root
- Exposes `theme$` Observable for template subscriptions

### UI Component

**`ThemeSwitcherComponent`** (`src/app/common/theme-switcher/theme-switcher.component.ts`):
- Displays a button to toggle between light/dark themes
- Responsive SVG icons (sun/moon)
- Accessible with proper ARIA labels

## Using Theme Colors in Components

### In Templates

Use CSS custom properties directly in your component styles:

```scss
// component.scss
.my-element {
  background-color: var(--color-bg-primary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}
```

### Using the Theme Mixin

For more complex scenarios, use the SCSS mixin:

```scss
@use './styles/themes/theme-mixin' as mixin;

.my-element {
  @include mixin.theme-colors(color, text-primary);
  @include mixin.theme-colors(background-color, bg-secondary);
}
```

### Available CSS Custom Properties

All color variables are automatically available throughout your app:

#### Primary Colors
- `--color-primary` - Main brand color
- `--color-primary-light` - Lighter variant
- `--color-primary-dark` - Darker variant

#### Background Colors
- `--color-bg-primary` - Main background
- `--color-bg-secondary` - Secondary background
- `--color-bg-tertiary` - Tertiary background

#### Text Colors
- `--color-text-primary` - Main text color
- `--color-text-secondary` - Secondary text
- `--color-text-muted` - Muted/disabled text

#### UI Elements
- `--color-border` - Border color
- `--color-shadow` - Shadow color

#### Status Colors
- `--color-success` - Success state
- `--color-warning` - Warning state
- `--color-error` - Error state
- `--color-info` - Info state

## Using the Theme Service

### Getting Current Theme

```typescript
import { ThemeService } from './services/theme.service';
import { inject } from '@angular/core';

export class MyComponent {
  private themeService = inject(ThemeService);

  getCurrentTheme() {
    return this.themeService.getCurrentTheme(); // 'light' | 'dark'
  }
}
```

### Subscribing to Theme Changes

```typescript
ngOnInit() {
  this.themeService.theme$.subscribe(theme => {
    console.log('Theme changed to:', theme);
    // React to theme changes
  });
}
```

### Changing Theme

```typescript
// Set specific theme
this.themeService.setTheme('dark');
this.themeService.setTheme('light');

// Toggle between themes
this.themeService.toggleTheme();
```

## How It Works

### Theme Preload (No Flash)

The `index.html` includes a preload script that runs before Angular loads:

```html
<script>
  // This script runs immediately and applies the saved theme
  // preventing white flash on page load
  (function () {
    const savedTheme = localStorage.getItem('gg-theme');
    const theme = savedTheme === 'dark' || savedTheme === 'light'
      ? savedTheme
      : window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    document.documentElement.classList.add('theme-' + theme);
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      document.documentElement.style.colorScheme = 'dark';
    }
  })();
</script>
```

This script:
1. Checks localStorage for saved theme
2. Falls back to system preference via `prefers-color-scheme`
3. Defaults to 'light' if no preference found
4. Applies the theme before Angular renders

### Theme Application

The service applies themes by:
1. Adding/removing `theme-light` or `theme-dark` class on `<html>`
2. Setting `data-theme` attribute on the document root
3. Setting `color-scheme` CSS property for browser UI integration

The SCSS theme files use these selectors:
```scss
:root.theme-light,
[data-theme='light'] {
  @include apply-theme($light-theme);
}
```

This ensures both mechanisms work correctly.

## Color Palettes

### Light Theme (GitHub)
- Primary: `#0969da` (GitHub Blue)
- Background: `#ffffff` (White)
- Text: `#24292f` (Dark Gray)
- Borders: `#d0d7de` (Light Gray)

### Dark Theme (GitHub)
- Primary: `#58a6ff` (GitHub Light Blue)
- Background: `#0d1117` (Very Dark)
- Text: `#c9d1d9` (Light Gray)
- Borders: `#30363d` (Dark Gray)

## Adding New Theme Colors

To add new colors to both themes:

1. **Update `_variables.scss`:**
   ```scss
   $light-theme: (
     // ... existing colors
     custom-color: #your-color,
   );

   $dark-theme: (
     // ... existing colors
     custom-color: #your-color,
   );
   ```

2. **Update the mixin in `_theme-mixin.scss`:**
   ```scss
   @mixin apply-theme($theme-map) {
     // ... existing properties
     --color-custom: #{map.get($theme-map, custom-color)};
   }
   ```

3. **Use in your components:**
   ```scss
   .element {
     color: var(--color-custom);
   }
   ```

## Bootstrap Integration

The theme system automatically overrides Bootstrap's default colors using CSS custom properties:

```scss
body {
  background-color: var(--color-bg-primary);
  color: var(--color-text-primary);
}

a {
  color: var(--color-primary);
  &:hover {
    color: var(--color-primary-light);
  }
}
```

Bootstrap's utility classes also use theme colors:
- `.btn-primary` - Uses `--color-primary`
- `.border` - Uses `--color-border`
- `.text-muted` - Uses `--color-text-muted`
- `.text-secondary` - Uses `--color-text-secondary`

## Example Component

```typescript
import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-example',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="card">
      <h2>Current Theme: {{ themeService.getCurrentTheme() }}</h2>
      <button (click)="themeService.toggleTheme()">Toggle Theme</button>
    </div>
  `,
  styles: [`
    .card {
      background-color: var(--color-bg-secondary);
      color: var(--color-text-primary);
      border: 1px solid var(--color-border);
      padding: 1rem;
      border-radius: 6px;
    }

    button {
      background-color: var(--color-primary);
      color: white;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 4px;
      cursor: pointer;

      &:hover {
        background-color: var(--color-primary-light);
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExampleComponent {
  themeService = inject(ThemeService);
}
```

## Browser Storage

The theme preference is stored in localStorage with the key `gg-theme`:

```javascript
localStorage.getItem('gg-theme'); // Returns 'light' or 'dark'
localStorage.setItem('gg-theme', 'dark');
```

The preference persists across browser sessions.

## System Preference Detection

If no theme is saved in localStorage, the system respects the user's OS preference:

```javascript
window.matchMedia('(prefers-color-scheme: dark)').matches
```

This ensures a good experience for users who have set their system to dark mode.

## Performance Considerations

1. **No Flash of Unstyled Content**: The preload script in `index.html` applies the theme before Angular renders
2. **No Layout Shift**: CSS transition on `<html>` element smooths theme changes
3. **Minimal Reflow**: CSS custom properties update efficiently
4. **Small Bundle Size**: SCSS compiles to minimal CSS

## Troubleshooting

### Theme Not Persisting

Check that localStorage is enabled in your browser and the localStorage API is working:

```javascript
localStorage.setItem('gg-theme', 'dark');
console.log(localStorage.getItem('gg-theme')); // Should log 'dark'
```

### Colors Not Updating

1. Verify you're using CSS custom properties (`var(--color-*)`)
2. Check browser DevTools to see if CSS variables are set on `:root`
3. Ensure components are using the service correctly

### White Flash on Load

If you see a white flash on page load:

1. Verify the preload script is in `index.html`
2. Check that localStorage has a saved theme
3. Ensure the CSS is loaded before DOM rendering

## References

- [GitHub's VS Code Theme](https://github.com/primer/github-vscode-theme)
- [CSS Custom Properties](https://developer.mozilla.org/en-US/docs/Web/CSS/--*)
- [Angular 21 Signals](https://angular.io/guide/signals)
- [prefers-color-scheme Media Query](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme)
