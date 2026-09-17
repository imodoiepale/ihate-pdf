import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('ihatepdf', {
  desktop: true,
  versions: process.versions
})
