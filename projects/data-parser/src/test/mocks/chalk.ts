type ChalkFn = ((value: unknown) => string) & {
    bold: (value: unknown) => string;
};

const createChalkFn = (): ChalkFn => {
    const fn = ((value: unknown): string => String(value)) as ChalkFn;
    fn.bold = (value: unknown): string => String(value);
    return fn;
};

const chalk = {
    red: createChalkFn(),
    yellow: createChalkFn(),
    green: createChalkFn(),
    blue: createChalkFn(),
    cyan: createChalkFn(),
    magenta: createChalkFn(),
    gray: createChalkFn(),
    bold: (value: unknown): string => String(value)
};

export default chalk;
