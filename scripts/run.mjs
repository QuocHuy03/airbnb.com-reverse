// Launcher: go bo ELECTRON_RUN_AS_NODE (neu moi truong set =1 se khien Electron
// chay nhu Node thuong -> `app` undefined). Dam bao dev/start luon chay dung.
import { spawn } from 'node:child_process'

const cmd = process.argv[2] || 'dev'
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn('npx', ['electron-vite', cmd], {
  stdio: 'inherit',
  env,
  shell: true
})
child.on('exit', (code) => process.exit(code ?? 0))
