/** Canonical display name: red lowercase i + dark “ hate pdf”. */
export const WORDMARK_LEAD = 'i'
export const WORDMARK_REST = ' hate pdf'

/** Window title, shortcuts, About, Settings, README. */
export const PRODUCT_NAME = `${WORDMARK_LEAD}${WORDMARK_REST}`

/** npm package, GitHub repo, executableName, installer artifacts, vendor dirs. */
export const PRODUCT_SLUG = 'ihate-pdf'

export const APP_ID = 'com.ihatepdf.app'

/** Default output folder under Documents. Slug paths (vendor, userData) stay PRODUCT_SLUG. */
export const DEFAULT_OUTPUT_FOLDER = PRODUCT_NAME

/** Previous default output folder — still treated as a safe index root. */
export const LEGACY_OUTPUT_FOLDER = 'IHATE PDF'
