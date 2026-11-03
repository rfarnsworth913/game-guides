export function friendlyImageName(name: string): string {
    return name.replace(/\.[^.]+$/, '').replace(/-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i, '')
        .replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
