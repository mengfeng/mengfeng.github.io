import {build} from 'esbuild';
import {rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
if(process.argv.includes('--test')){
 await build({entryPoints:['test.ts'],bundle:true,platform:'node',format:'cjs',outfile:'.test.cjs'});
 const result=spawnSync(process.execPath,['.test.cjs'],{stdio:'inherit'});await rm('.test.cjs');process.exitCode=result.status??1;
}else{
 await build({entryPoints:['src/core.ts'],bundle:true,platform:'neutral',format:'esm',outfile:'protocol.mjs',minify:false});
 await build({entryPoints:['src/app.ts'],bundle:true,format:'iife',outfile:'app.js',minify:true,legalComments:'eof',define:{__VUE_OPTIONS_API__:'false',__VUE_PROD_DEVTOOLS__:'false',__VUE_PROD_HYDRATION_MISMATCH_DETAILS__:'false','process.env.NODE_ENV':'"production"'}});
}
