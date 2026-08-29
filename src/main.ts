import './styles/main.css'
import { createSessionRouter } from './ui/router'

// The console: one mount, five phases (T5). The router owns every screen swap
// and the live loop around the T3 controller; styling arrives with T8–T11.
// Production wiring only — tests construct the router directly with injected
// clock/frame/timer seams, so no test hook lives on this path.
const mount = document.querySelector<HTMLElement>('#app')
if (mount === null) {
  throw new Error('Fatal: #app mount point missing from index.html')
}

createSessionRouter({ root: mount, window, document })
