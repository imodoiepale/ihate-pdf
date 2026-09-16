declare global {
  interface Window {
    lovepdf?: {
      desktop: boolean
      versions: NodeJS.ProcessVersions
    }
  }
}

export {}
