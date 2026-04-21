export function editorClass(component: string) {
  return `inkwell-editor-${component}`;
}

export function pluginClass(pluginName: string) {
  return (component: string) => `inkwell-plugin-${pluginName}-${component}`;
}
