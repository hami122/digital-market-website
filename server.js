import http from 'node:http';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {extname,resolve,sep,dirname} from 'node:path';
import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
const root=resolve('public'), dataDir=resolve(process.env.DATA_DIR||'./data'), file=resolve(dataDir,'products.json'), storeFile=resolve(dataDir,'store.json');
const uploadDir=resolve(dataDir,'uploads');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml'};
const seed=[{id:1,name:'Premium подписка — 1 месяц',category:'Подписки',price:490,description:'Цифровая подписка на один месяц.',symbol:'👑',accent:'#6335a1',tag:'ПОПУЛЯРНО'},{id:2,name:'Игровой подарочный код',category:'Игры',price:1290,description:'Подарочный цифровой код для игр.',symbol:'🎮',accent:'#265b92',tag:'ХИТ'},{id:3,name:'Лицензионный ключ',category:'Ключи',price:790,description:'Ключ для активации цифрового продукта.',symbol:'🔑',accent:'#79502b',tag:'НОВИНКА'}];
let products=[];try{const d=JSON.parse(await readFile(file,'utf8'));if(!Array.isArray(d))throw Error('invalid database');products=d}catch(e){if(e.code!=='ENOENT')throw e;products=seed;await save()}
async function save(){await mkdir(dirname(file),{recursive:true});const tmp=file+'.'+process.pid+'.tmp';await writeFile(tmp,JSON.stringify(products,null,2));await rename(tmp,file)}
let store={orders:[],customers:[],settings:{storeName:'Digital Market',currency:'₽',paymentInstructions:'После оформления заказа дождитесь подтверждения менеджера. Оплата на сайте пока не принимается.',contact:'',acceptOrders:true}};
try{const d=JSON.parse(await readFile(storeFile,'utf8'));store={...store,...d,settings:{...store.settings,...(d.settings||{})}}}catch(e){if(e.code!=='ENOENT')throw e}
async function saveStore(){await mkdir(dataDir,{recursive:true});const temp=storeFile+'.'+process.pid+'.tmp';await writeFile(temp,JSON.stringify(store,null,2));await rename(temp,storeFile)}
const loginAttempts=new Map(), checkoutAttempts=new Map();
function rateLimit(map,key,max,windowMs){const now=Date.now();let v=map.get(key);if(!v||v.until<now)v={count:0,until:now+windowMs};v.count++;map.set(key,v);if(map.size>10000)for(const [k,x] of map)if(x.until<now)map.delete(k);return v.count<=max}
function clean(x,max=200){return String(x??'').trim().slice(0,max)}
function validateSettings(x){if(!x||typeof x!=='object')throw Error('Неверные настройки');return {storeName:clean(x.storeName,80)||'Digital Market',currency:clean(x.currency,5)||'₽',paymentInstructions:clean(x.paymentInstructions,1500),contact:clean(x.contact,200),acceptOrders:!!x.acceptOrders}}
function publicSettings(){const {storeName,currency,paymentInstructions,contact,acceptOrders}=store.settings;return {storeName,currency,paymentInstructions,contact,acceptOrders}}
const sessions=new Map();const password=process.env.ADMIN_PASSWORD||'';if(!password||password.length<12)console.error('ADMIN_PASSWORD must be set (minimum 12 characters); admin login disabled until configured.');
const passSalt=randomBytes(16);const passHash=password?scryptSync(password,passSalt,64):null;
function json(res,status,data,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(data))}
function cookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').map(s=>s.trim().split('=').slice(0,2)).filter(a=>a.length===2))}
function auth(req){const token=cookies(req).dm_admin;if(!token)return false;const key=createHash('sha256').update(token).digest('hex');const exp=sessions.get(key);if(!exp||exp<Date.now()){sessions.delete(key);return false}return key}
function validOrigin(req){const origin=req.headers.origin;if(!origin)return false;try{const u=new URL(origin);return u.host===req.headers.host&&((u.protocol==='https:')||(u.protocol==='http:'&&(['localhost','127.0.0.1'].includes(u.hostname))))}catch{return false}}
async function body(req){let s='';for await(const chunk of req){s+=chunk;if(s.length>16000)throw Error('Payload too large')}return JSON.parse(s||'{}')}
function validate(x){if(!x||typeof x!=='object')throw Error('Неверные данные');const name=String(x.name||'').trim(),description=String(x.description||'').trim(),category=String(x.category||'').trim(),tag=String(x.tag||'').trim(),symbol=String(x.symbol||'✦').trim(),accent=String(x.accent||'#603b99');const image=clean(x.image,180);if(image&&!/^\/uploads\/[a-f0-9]{32}\.(png|jpg|webp)$/.test(image))throw Error('Неверное изображение');const price=Number(x.price),stock=x.stock===''||x.stock===null||x.stock===undefined?null:Number(x.stock),active=x.active===undefined?true:!!x.active;if(!name||name.length>100||description.length>500||!category||category.length>60||tag.length>30||symbol.length>12||!/^#[0-9a-fA-F]{6}$/.test(accent)||!Number.isSafeInteger(price)||price<1||price>10000000||(stock!==null&&(!Number.isSafeInteger(stock)||stock<0||stock>1000000)))throw Error('Проверьте поля товара');return {name,description,category,tag,symbol,accent,image,price,stock,active}}
const server=http.createServer(async(req,res)=>{let url;try{url=new URL(req.url,'http://localhost')}catch{return json(res,400,{error:'Bad request'})}const path=url.pathname;try{
if(path==='/api/admin/upload'&&req.method==='POST'){
 if(!auth(req))return json(res,401,{error:'Требуется вход'});
 if(!validOrigin(req))return json(res,403,{error:'Origin not allowed'});
 const declared=Number(req.headers['content-length']);if(Number.isFinite(declared)&&declared>5*1024*1024)return json(res,413,{error:'Максимальный размер 5 МБ'});
 const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>5*1024*1024)return json(res,413,{error:'Максимальный размер 5 МБ'});chunks.push(chunk)}
 const b=Buffer.concat(chunks);let ext='';
 if(b.length>=8&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))ext='png';
 else if(b.length>=4&&b[0]===255&&b[1]===216&&b[2]===255)ext='jpg';
 else if(b.length>=12&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP')ext='webp';
 if(!ext)return json(res,415,{error:'Загрузите PNG, JPG или WEBP'});
 await mkdir(uploadDir,{recursive:true});const name=randomBytes(16).toString('hex')+'.'+ext;await writeFile(resolve(uploadDir,name),b,{flag:'wx'});
 return json(res,201,{url:'/uploads/'+name});
}
if(path.startsWith('/uploads/')&&(req.method==='GET'||req.method==='HEAD')){
 const name=path.slice('/uploads/'.length);if(!/^[a-f0-9]{32}\.(png|jpg|webp)$/.test(name))return json(res,404,{error:'Not found'});
 const b=await readFile(resolve(uploadDir,name));const ext=extname(name);
 res.writeHead(200,{'Content-Type':ext==='.png'?'image/png':ext==='.webp'?'image/webp':'image/jpeg','Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'});
 return res.end(req.method==='HEAD'?undefined:b);
}
if(path==='/api/products'&&req.method==='GET')return json(res,200,products);
if(path==='/api/settings'&&req.method==='GET')return json(res,200,publicSettings());
if(path==='/api/orders'&&req.method==='POST'){if(!validOrigin(req))return json(res,403,{error:'Origin not allowed'});const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',')[0].trim();if(!rateLimit(checkoutAttempts,ip,10,3600000))return json(res,429,{error:'Слишком много заказов. Попробуйте позже'});if(!store.settings.acceptOrders)return json(res,403,{error:'Приём заказов временно отключён'});const d=await body(req);const name=clean(d.name,100),contact=clean(d.contact,160),notes=clean(d.notes,500);if(name.length<2||contact.length<4||!Array.isArray(d.items)||d.items.length<1||d.items.length>50)return json(res,400,{error:'Проверьте данные заказа'});if(!/^[\p{L}\p{N}\s+@()._:-]+$/u.test(contact))return json(res,400,{error:'Неверный контакт'});let total=0;const items=[];for(const item of d.items){const id=Number(item.id),qty=Number(item.qty);if(!Number.isSafeInteger(id)||!Number.isSafeInteger(qty)||qty<1||qty>20)return json(res,400,{error:'Неверная корзина'});const p=products.find(x=>x.id===id);if(!p||p.active===false)return json(res,400,{error:'Товар недоступен'});if(p.stock!==null&&p.stock!==undefined&&p.stock<qty)return json(res,400,{error:'Недостаточно товара: '+p.name});items.push({id,name:p.name,price:p.price,qty});total+=p.price*qty}if(total>100000000)return json(res,400,{error:'Сумма слишком велика'});const order={id:'DM-'+Date.now().toString(36).toUpperCase()+'-'+randomBytes(3).toString('hex').toUpperCase(),createdAt:new Date().toISOString(),name,contact,notes,items,total,status:'new'};store.orders.unshift(order);const c=store.customers.find(x=>x.contact.toLowerCase()===contact.toLowerCase());if(c){c.name=name;c.orders++;c.lastOrderAt=order.createdAt}else store.customers.push({name,contact,orders:1,lastOrderAt:order.createdAt});await saveStore();return json(res,201,{id:order.id,total,status:order.status,paymentInstructions:store.settings.paymentInstructions,contact:store.settings.contact})}
if(path==='/api/admin/session'&&req.method==='GET')return json(res,200,{authenticated:!!auth(req)});
if(path.startsWith('/api/admin/')&&req.method!=='GET'&&!validOrigin(req))return json(res,403,{error:'Origin not allowed'});
if(path==='/api/admin/login'&&req.method==='POST'){const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',')[0].trim();if(!rateLimit(loginAttempts,ip,8,900000))return json(res,429,{error:'Слишком много попыток входа'});const d=await body(req);const candidate=scryptSync(String(d.password||'').slice(0,1024),passSalt,64);if(!passHash||!timingSafeEqual(candidate,passHash))return json(res,401,{error:'Неверный пароль'});const token=randomBytes(32).toString('hex');sessions.set(createHash('sha256').update(token).digest('hex'),Date.now()+8*3600000);return json(res,200,{ok:true},{'Set-Cookie':`dm_admin=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=28800${req.headers['x-forwarded-proto']==='https'?', Secure':''}`})}
if(path==='/api/admin/logout'&&req.method==='POST'){const key=auth(req);if(key)sessions.delete(key);return json(res,200,{ok:true},{'Set-Cookie':'dm_admin=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0'})}
if(path.startsWith('/api/admin/')&&!auth(req))return json(res,401,{error:'Требуется вход'});
if(path==='/api/admin/orders'&&req.method==='GET')return json(res,200,store.orders);
if(path==='/api/admin/customers'&&req.method==='GET')return json(res,200,store.customers);
if(path==='/api/admin/settings'&&req.method==='GET')return json(res,200,store.settings);
if(path==='/api/admin/settings'&&req.method==='PUT'){store.settings=validateSettings(await body(req));await saveStore();return json(res,200,store.settings)}
const om=path.match(/^\/api\/admin\/orders\/([A-Za-z0-9-]+)$/);if(om&&req.method==='PUT'){const order=store.orders.find(x=>x.id===om[1]);if(!order)return json(res,404,{error:'Заказ не найден'});const d=await body(req);if(!['new','confirmed','paid','completed','cancelled'].includes(d.status))return json(res,400,{error:'Неверный статус'});order.status=d.status;order.updatedAt=new Date().toISOString();await saveStore();return json(res,200,order)}
if(path==='/api/admin/products'&&req.method==='POST'){const p={id:Math.max(0,...products.map(x=>x.id))+1,...validate(await body(req))};products.push(p);await save();return json(res,201,p)}
const match=path.match(/^\/api\/admin\/products\/(\d+)$/);if(match){const id=Number(match[1]),i=products.findIndex(p=>p.id===id);if(i<0)return json(res,404,{error:'Товар не найден'});if(req.method==='PUT'){products[i]={id,...validate(await body(req))};await save();return json(res,200,products[i])}if(req.method==='DELETE'){products.splice(i,1);await save();return json(res,200,{ok:true})}}
if(path.startsWith('/api/'))return json(res,404,{error:'Not found'});
if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Method not allowed'});
let pathname;try{pathname=decodeURIComponent(path)}catch{return json(res,400,{error:'Bad path'})}const target=resolve(root,'.'+(pathname==='/'?'/index.html':pathname==='/admin'?'/admin.html':pathname));if(!target.startsWith(root+sep))return json(res,403,{error:'Forbidden'});const data=await readFile(target);res.writeHead(200,{'Content-Type':types[extname(target)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'});res.end(req.method==='HEAD'?undefined:data);
}catch(e){if(e.code==='ENOENT')return json(res,404,{error:'Not found'});if(e instanceof SyntaxError||['Payload too large','Проверьте поля товара','Неверные данные'].includes(e.message))return json(res,400,{error:e.message});console.error(e);return json(res,500,{error:'Server error'})}});
server.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('Digital Market running'));
