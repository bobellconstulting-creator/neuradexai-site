export type Tool = {
  id: string
  name: string
  color: string
  icon: string
  badge: string
}

export const TOOLS: Tool[] = [
  { id: 'nav',         name: 'PAN',       color: '#d7ddd4', icon: 'Move',        badge: 'N' },
  { id: 'boundary',    name: 'BORDER',    color: '#FF6B00', icon: 'Boundary',    badge: 'B' },
  { id: 'clover',      name: 'CLOVER',    color: '#4ade80', icon: 'Clover',      badge: 'CL' },
  { id: 'brassicas',   name: 'BRASSICAS', color: '#c084fc', icon: 'Brassicas',   badge: 'BR' },
  { id: 'corn',        name: 'CORN',      color: '#facc15', icon: 'Corn',        badge: 'CR' },
  { id: 'soybeans',    name: 'SOYBEANS',  color: '#86efac', icon: 'Soybeans',    badge: 'SY' },
  { id: 'milo',        name: 'MILO',      color: '#d97706', icon: 'Milo',        badge: 'ML' },
  { id: 'egyptian',    name: 'EGYPTIAN',  color: '#fb923c', icon: 'Egyptian',    badge: 'EG' },
  { id: 'switchgrass', name: 'SWITCH',    color: '#fdba74', icon: 'Switchgrass', badge: 'SW' },
  { id: 'bedding',     name: 'HINGE',     color: '#713f12', icon: 'Bedding',     badge: 'HG' },
  { id: 'stand',       name: 'STAND',     color: '#ef4444', icon: 'Stand',       badge: 'ST' },
  { id: 'focus',       name: 'FOCUS',     color: '#FF0000', icon: 'Focus',       badge: 'FC' },
]

export const FOOD_TYPES = new Set(['clover','brassicas','corn','soybeans','milo','egyptian','switchgrass'])
