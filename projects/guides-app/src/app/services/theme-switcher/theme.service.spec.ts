import { ThemeService } from "./theme.service";


describe("ThemeService", () => {

    // Test configuration -----------------------------------------------------
    const themeID = "gg-theme";

    let getItemMock: ReturnType<typeof vi.fn>;
    let setItemMock: ReturnType<typeof vi.fn>;

    /**
     * Sets up a mock for localStorage with getItem and setItem spies.
     */
    function setupLocalStorage (): void {
        getItemMock = vi.fn();
        setItemMock = vi.fn();

        const localStorageMock = {
            getItem: getItemMock,
            setItem: setItemMock,
            removeItem: vi.fn(),
            clear: vi.fn(),
            key: vi.fn(),
            length: 0,
        };

        Object.defineProperty(window, "localStorage", {
            configurable: true,
            value: localStorageMock
        });

        Object.defineProperty(globalThis, "localStorage", {
            configurable: true,
            value: localStorageMock
        });
    }

    /**
     * Sets up a mock for window.matchMedia with the specified prefers-color-scheme.
     */
    function setupMatchMedia (prefersDark: boolean): void {
        Object.defineProperty(window, "matchMedia", {
            configurable: true,
            writable: true,
            value: vi.fn().mockImplementation((query: string) => ({
                matches: query === "(prefers-color-scheme: dark)" ? prefersDark : false,
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            }))
        });
    }

    /**
     * Creates an instance of ThemeService with mocked localStorage and matchMedia.
     *
     * @param savedTheme  - The theme value to be returned by localStorage.getItem.
     * @param prefersDark - Whether the system prefers a dark color scheme.
     * @returns           A new instance of ThemeService.
     */
    function createService (savedTheme: string | null, prefersDark = false): ThemeService {
        setupLocalStorage();
        setupMatchMedia(prefersDark);
        getItemMock.mockImplementation((key: string) => (key === themeID ? savedTheme : null));

        return new ThemeService();
    }

    beforeEach(() => {
        vi.restoreAllMocks();

        const root = document.documentElement;
        root.classList.remove("theme-light", "theme-dark");
        root.removeAttribute("data-theme");
    });


    describe("localstorage interactions", () => {
        it("returns light when localStorage has light", () => {
            const service = createService("light");
            expect(service.getTheme()).toBe("light");
        });

        it("returns dark when localStorage has dark", () => {
            const service = createService("dark");
            expect(service.getTheme()).toBe("dark");
        });

        it("falls back to dark when localStorage has unknown theme and system prefers dark", () => {
            const service = createService("unknown", true);
            expect(service.getTheme()).toBe("dark");
        });

        it("falls back to light when localStorage has unknown theme and system prefers light", () => {
            const service = createService("unknown", false);
            expect(service.getTheme()).toBe("light");
        });
    });


    describe("page interaction handling", () => {
        it("setTheme updates active theme, stores value, and updates root classes", () => {
            const service = createService("light");
            const root = document.documentElement;
            root.classList.add("theme-light");

            service.setTheme("dark");

            expect(service.getTheme()).toBe("dark");
            expect(setItemMock).toHaveBeenCalledWith(themeID, "dark");
            expect(root.classList.contains("theme-light")).toBe(false);
            expect(root.classList.contains("theme-dark")).toBe(true);
            expect(root.getAttribute("data-theme")).toBe("dark");
        });

        it("toggleTheme switches from light to dark", () => {
            const service = createService("light");

            service.toggleTheme();

            expect(service.getTheme()).toBe("dark");
            expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
        });

        it("toggleTheme switches from dark to light", () => {
            const service = createService("dark");

            service.toggleTheme();

            expect(service.getTheme()).toBe("light");
            expect(document.documentElement.getAttribute("data-theme")).toBe("light");
        });

        it("initializeTheme applies the resolved initial theme to DOM", () => {
            const service = createService("dark");

            service.initializeTheme();

            expect(service.getTheme()).toBe("dark");
            expect(document.documentElement.classList.contains("theme-dark")).toBe(true);
            expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
        });

        it("initializeTheme handles unknown saved theme by applying fallback", () => {
            const service = createService("unknown", false);

            service.initializeTheme();

            expect(service.getTheme()).toBe("light");
            expect(document.documentElement.classList.contains("theme-light")).toBe(true);
            expect(document.documentElement.getAttribute("data-theme")).toBe("light");
        });
    });

});
