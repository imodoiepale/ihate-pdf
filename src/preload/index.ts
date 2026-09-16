import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('lovepdf', {
  desktop: true,
  versions: process.versions
})
