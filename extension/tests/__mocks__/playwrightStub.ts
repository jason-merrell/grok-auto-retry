export const expect = () => {
    throw new Error('Playwright expect API is not available in Vitest unit runs.');
};

export const test = () => {
    throw new Error('Playwright test API is not available in Vitest unit runs.');
};

export default { test, expect };
