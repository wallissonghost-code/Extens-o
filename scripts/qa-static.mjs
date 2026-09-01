import fs from 'node:fs';
const required=['index.html','src/ui/styles.css','src/ui/app.js','src/application/gift-service.js','src/infrastructure/game-live-source.js','data/verified-gifts.json'];for(const f of required)if(!fs.existsSync(f))throw new Error('Arquivo ausente: '+f);
const html=fs.readFileSync('index.html','utf8'),svc=fs.readFileSync('src/application/gift-service.js','utf8'),css=fs.readFileSync('src/ui/styles.css','utf8'),data=JSON.parse(fs.readFileSync('data/verified-gifts.json','utf8'));
for(const token of ['LIMPAR HISTÓRICO','data-tab="saved"','data-tab="verified"'])if(!html.includes(token))throw new Error('Contrato UI ausente: '+token);
if(!svc.includes("clearHistory() { this.store.clearDiscoveries(); }"))throw new Error('Clear history perdeu isolamento');
if(!css.includes('@media(max-width:720px)'))throw new Error('Responsividade móvel ausente');
if(data.schema!=='liveplus.verified-gifts.v1'||data.count!==57||data.gifts.length!==57)throw new Error('Backup verificado inválido');
console.log('QA estático: OK — isolamento, mobile e backup de 57 presentes validados.');
