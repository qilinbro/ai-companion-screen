// Prepare a relocatable runtime without copying the local character or profile.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
if(process.platform!=='win32'||process.arch!=='x64'||!/^\d+\.\d+\.\d+$/.test(version))throw new Error('Release requires Windows x64 and a numeric version');
const source=path.join(root,'outputs',`banping-v${version}-win32-x64`);
const releaseRoot=path.join(root,'outputs','releases',`v${version}`);
const bundle=path.join(releaseRoot,`banping-v${version}-win-x64`);
const zip=path.join(releaseRoot,`banping-v${version}-win-x64.zip`);
const connector=path.join(root,'outputs','release-tools','首次连接原角色.exe');
const publicRenderer=path.join(root,'apps','desktop','dist');
const localUser=path.basename(process.env.USERPROFILE??'');
const omitted=new Set(['resources/app/local-desktop.json','使用说明.txt']);
const forbidden=new Set(['vendor','local-study-profile','outputs','validation','tests','.git','.codex']);

function walk(directory){
  const stat=fs.lstatSync(directory);
  if(!stat.isDirectory()||stat.isSymbolicLink()||fs.realpathSync(directory)!==directory)throw new Error('Nonordinary release input');
  const files=[];
  for(const item of fs.readdirSync(directory,{withFileTypes:true})){
    const full=path.join(directory,item.name);
    if(item.isSymbolicLink())throw new Error('Release links are rejected');
    if(item.isDirectory())files.push(...walk(full));
    else if(item.isFile())files.push(full);
    else throw new Error('Unexpected release entry');
  }
  return files;
}
function copy(file,target){fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file,target);}
async function hash(file){const h=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))h.update(chunk);return h.digest('hex');}
const inputs=walk(source);
const manifest=JSON.parse(fs.readFileSync(path.join(source,'resources','app','package.json'),'utf8'));
if(manifest.version!==version)throw new Error('Release source version differs');
if(!fs.statSync(connector).isFile())throw new Error('Build the native character connector first');
const publicFiles=walk(publicRenderer);
if(!publicFiles.some(f=>path.basename(f)==='character.html'))throw new Error('Build the public no-asset page first');
if(fs.existsSync(bundle)||fs.existsSync(zip))throw new Error('Release output already exists; never overwrite a reviewed package implicitly');
if(!releaseRoot.startsWith(path.join(root,'outputs')+path.sep))throw new Error('Release escaped outputs');
fs.mkdirSync(bundle,{recursive:true});
for(const file of inputs){
  const relative=path.relative(source,file).split(path.sep).join('/');
  if(omitted.has(relative))continue;
  if(relative.split('/').some(s=>forbidden.has(s))||/\.(?:map|log)$/i.test(relative))throw new Error('Forbidden local data in source package');
  copy(file,path.join(bundle,relative));
}
for(const file of publicFiles)copy(file,path.join(bundle,'resources','app','apps','desktop','dist',path.relative(publicRenderer,file)));
copy(connector,path.join(bundle,'首次连接原角色.exe'));
copy(path.join(root,'README-RELEASE-WINDOWS.txt'),path.join(bundle,'使用说明.txt'));

const rows=[];
for(const file of walk(bundle)){
  const relative=path.relative(bundle,file).split(path.sep).join('/');
  if(path.basename(file)==='local-desktop.json'||relative.split('/').some(s=>forbidden.has(s)))throw new Error('Private deployment material in release');
  if(['geometry-data.js','math.js','tables.js','pose.js','tricks.js','fx.js','eyes.js','character.js'].includes(path.basename(file)))throw new Error('Original character source was copied');
  const bytes=fs.readFileSync(file);
  if(relative.startsWith('resources/app/apps/')||file===path.join(bundle,'使用说明.txt')||path.basename(file)==='首次连接原角色.exe'){
    if(localUser&&(bytes.includes(Buffer.from(localUser,'utf8'))||bytes.includes(Buffer.from(localUser,'utf16le'))))throw new Error('Personal path in release');
    if(/\.(?:html|js|css|json|txt)$/i.test(file)&&/(?:[A-Z]:[\\/]Users[\\/]|奶油色小宠物|dotpet-breathe)/i.test(bytes.toString('utf8')))throw new Error('Private path or obsolete role in release');
  }
  rows.push({file:relative,bytes:bytes.length,sha256:await hash(file)});
}
fs.writeFileSync(path.join(releaseRoot,'package-manifest.json'),JSON.stringify({version,date:'2026-10-21',originalAssetsIncluded:false,localDeploymentMarkerIncluded:false,files:rows},null,2)+'\n');
console.log(JSON.stringify({stagedFiles:rows.length,rawBytes:rows.reduce((n,r)=>n+r.bytes,0),privateMarkerIncluded:false,originalAssetsIncluded:false}));
if(!process.argv.includes('--stage-only')){
  const command="Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory($env:BANPING_RELEASE_DIRECTORY,$env:BANPING_RELEASE_ARCHIVE,[System.IO.Compression.CompressionLevel]::Optimal,$true)";
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{cwd:root,windowsHide:true,stdio:'inherit',env:{...process.env,BANPING_RELEASE_DIRECTORY:bundle,BANPING_RELEASE_ARCHIVE:zip}});
  if(result.error||result.status!==0)throw new Error('Release archive creation failed');
  const digest=await hash(zip);
  fs.writeFileSync(path.join(releaseRoot,'SHA256SUMS.txt'),digest+'  '+path.basename(zip)+'\n');
  console.log(JSON.stringify({archive:path.basename(zip),bytes:fs.statSync(zip).size,sha256:digest}));
}
