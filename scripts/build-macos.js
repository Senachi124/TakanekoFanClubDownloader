const {execFileSync} = require('node:child_process');
const {prepareMacTools} = require('./prepare-macos-tools');
function buildArguments(args) {
  if (args.some(arg=>!['--x64','--arm64','--dir'].includes(arg))) throw new Error('Use --x64, --arm64 and/or --dir for build:mac');
  const architectures = [...new Set(args.filter(arg=>arg!=='--dir').map(arg=>arg.slice(2)))];
  return {architectures:architectures.length?architectures:['x64','arm64'],directoryOnly:args.includes('--dir')};
}
async function main() {
  if (process.platform!=='darwin') throw new Error('Build macOS installers on macOS.');
  const {architectures,directoryOnly} = buildArguments(process.argv.slice(2));
  for (const arch of architectures) await prepareMacTools(arch);
  execFileSync(process.execPath,[require.resolve('electron-builder/out/cli/cli.js'),'--mac',...architectures.map(arch=>'--'+arch),...(directoryOnly?['--dir']:[])],{stdio:'inherit'});
}
module.exports = {buildArguments};
if (require.main===module) main().catch(error=>{console.error(error.message);process.exitCode=1;});
