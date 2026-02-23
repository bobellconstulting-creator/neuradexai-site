export type Tool = {
  id: string
  name: string
  color: string
  icon: string
}

export const TOOLS: Tool[] = [
  { id: 'nav',        name: 'PAN',       color: '#fff',    icon: '✋' },
  { id: 'boundary',   name: 'BORDER',    color: '#FF6B00', icon: '🟧' },
  { id: 'clover',     name: 'CLOVER',    color: '#4ade80', icon: '🍀' },
  { id: 'brassicas',  name: 'BRASSICAS', color: '#c084fc', icon: '🥬' },
  { id: 'corn',       name: 'CORN',      color: '#facc15', icon: '🌽' },
  { id: 'soybeans',   name: 'SOYBEANS',  color: '#86efac', icon: '🫘' },
  { id: 'milo',       name: 'MILO',      color: '#d97706', icon: '🌰' },
  { id: 'egyptian',   name: 'EGYPTIAN',  color: '#fb923c', icon: '🌾' },
  { id: 'switchgrass',name: 'SWITCH',    color: '#fdba74', icon: '🌿' },
  { id: 'bedding',    name: 'HINGE',     color: '#713f12', icon: '🪚' },
  { id: 'stand',      name: 'STAND',     color: '#ef4444', icon: '🏹' },
  { id: 'focus',      name: 'FOCUS',     color: '#FF0000', icon: '⭕' },
]

export const FOOD_TYPES = new Set(['clover','brassicas','corn','soybeans','milo','egyptian','switchgrass'])
