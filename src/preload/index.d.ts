declare global {
  interface Window {
    ihatepdf?: {
      desktop: boolean
      versions: NodeJS.ProcessVersions
    }
  }
}

export {}
