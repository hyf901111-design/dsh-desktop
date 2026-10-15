/** Shared by the native slash menu and its inline creation controls. */
const icons={
 sparkles:{color:'#7988f3',paths:[
  'M7 5c.7 3.3 1.7 4.3 5 5-3.3.7-4.3 1.7-5 5-.7-3.3-1.7-4.3-5-5 3.3-.7 4.3-1.7 5-5Z',
  'M13.5 2c.35 1.65.85 2.15 2.5 2.5-1.65.35-2.15.85-2.5 2.5-.35-1.65-.85-2.15-2.5-2.5 1.65-.35 2.15-.85 2.5-2.5Z'
 ]},
 link:{color:'#229bb8',paths:[
  'M7.2 10.8a3.2 3.2 0 0 0 4.53 0l2.4-2.4A3.2 3.2 0 0 0 9.6 3.87L8.25 5.22',
  'M10.8 7.2a3.2 3.2 0 0 0-4.53 0l-2.4 2.4a3.2 3.2 0 0 0 4.53 4.53l1.35-1.35'
 ]}
} as const

export function noteCreationIcon(kind:string){return kind==='sparkles'||kind==='link'?icons[kind]:undefined}
