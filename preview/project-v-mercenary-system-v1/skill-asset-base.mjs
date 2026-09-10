// Pixi treats an extensionless document URL as a directory. Pages removes .html,
// so the shared V3 engine's ../../assets paths need an explicit directory base.
export function skillAssetBaseUrl(pageUrl) {
  return new URL('/preview/project-v-v3/', pageUrl).href;
}
