import { selectors as defaultSelectors } from '../../src/config/selectors';

/**
 * Provides a plain-object snapshot of the extension selector defaults so tests
 * fail when the production configuration changes.
 */
export const getSelectorSnapshot = () => (
  JSON.parse(JSON.stringify(defaultSelectors)) as typeof defaultSelectors
);
