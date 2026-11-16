const assets = import.meta.glob('./assets/*.svg', { eager: true, query: '?inline', import: 'default' }) as Record<string, string>

export const iconSource = (name: string) => assets['./assets/' + name + '.svg']
