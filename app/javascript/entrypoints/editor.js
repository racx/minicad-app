/* Editor entrypoint — the only Vite-bundled page. Mounts the MiniCAD engine
   (npm workspace `minicad`, symlinked from the engine repo — read-only here).
   Stage 1: import a pure module to prove workspace resolution in the build.
   The full mount (DOM inject + engine boot + Rails persistence adapter)
   lands in Stage 4. */
import { fmt } from 'minicad/js/geometry.js'

console.log('MiniCAD editor entrypoint loaded (engine fmt check:', fmt(1.5), ')')
