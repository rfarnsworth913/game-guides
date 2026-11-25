/** Canonical image categories used by metadata validation and the shared browser. */
export const IMAGE_CATEGORIES = {
    banner: { label: 'Banners', singular: 'banner', ratio: 3, fit: 'cover' },
    headshot: { label: 'Headshots', singular: 'headshot', ratio: 1, fit: 'cover' },
    character: { label: 'Splash Art', singular: 'splash art', ratio: 3 / 4, fit: 'contain' },
    icon: { label: 'Icons', singular: 'icon', ratio: 1, fit: 'contain' },
    landscape: { label: 'Other', singular: 'image', ratio: 4 / 3, fit: 'contain' },
} as const;
