const dialog = document.querySelector('#account-dialog');
const content = document.querySelector('#account-content');
const bar = document.querySelector('#online-bar');
const offline = new URLSearchParams(location.search).get('offline') === '1';
let session = null, visited = null, syncing = false;
const text = (tag,value,parent) => {const element=document.createElement(tag);element.textContent=value;if(parent)parent.append(element);return element;};
const button = (label,action,parent) => {const element=text('button',label,parent);element.type='button';element.addEventListener('click',async()=>{element.disabled=true;try{await action();}catch(error){showError(error);}finally{element.disabled=false;}});return element;};
function showError(error) {let element=content.querySelector('.message');if(!element){element=text('p','',content);element.className='message';element.setAttribute('role','alert');}element.textContent=error.message||String(error);if(!dialog.open)dialog.showModal();}
function reset(title) {content.replaceChildren();const heading=text('h1',title,content);heading.id='dialog-title';if(!dialog.open)dialog.showModal();}
function closeButton() {button('Fermer',()=>dialog.close(),content);}
const messages={authentication_required:'Reconnectez-vous pour reprendre votre hôtel.',invalid_credentials:'Identifiants invalides. Nom : 3 à 32 lettres/chiffres ; mot de passe : au moins 10 caractères.',name_taken:'Ce nom est déjà utilisé.',friendship_required:'Une amitié acceptée est nécessaire.',request_not_found:'Demande introuvable.',already_claimed:'Ce cadeau a déjà été reçu.',insufficient_funds:'Vous ne disposez pas de cette quantité.',revision_conflict:'L’hôtel a changé. Synchronisez-le avant de continuer.',cooldown:'L’amour de cet hôtel a déjà été récupéré. Revenez plus tard.'};
async function api(path,method='GET',value) {
  const headers={};if(method!=='GET'){headers['Content-Type']='application/json';if(session)headers['X-CSRF-Token']=session.csrf;}
  const controller=new AbortController(), deadline=setTimeout(()=>controller.abort(),15000);
  try {
    const response=await fetch(path,{method,headers,signal:controller.signal,credentials:'same-origin',body:value===undefined?undefined:JSON.stringify(value)});
    const data=await response.json();if(response.status===401&&session&&path!=='/api/auth/logout')signedOut();if(!response.ok)throw Object.assign(new Error(messages[data.error]||data.error||'La requête a échoué.'),{status:response.status});return data;
  } finally {clearTimeout(deadline);}
}
const socialKey=()=>`mh.social.${session.player.id}`;
async function sendSocial(pending) {
  try {const result=await api(pending.path,'POST',pending.value);sessionStorage.removeItem(socialKey());return result;}
  catch(error){if(error.status>=400&&error.status<500&&error.status!==401)sessionStorage.removeItem(socialKey());throw error;}
}
async function mutate(path,value) {
  if(!window.MonsterHotel.beginNavigation())throw new Error('Attendez la fin de l’action avant de continuer.');
  try {
    const pending={path,value}, previous=sessionStorage.getItem(socialKey());
    if(previous&&previous!==JSON.stringify(pending))throw new Error('Une action sociale attend sa confirmation. Utilisez Synchroniser pour la reprendre.');
    sessionStorage.setItem(socialKey(),JSON.stringify(pending));
    return await sendSocial(pending);
  } finally {window.MonsterHotel.endNavigation();}
}
async function ready() {for(let i=0;i<900;i++){if(window.MonsterHotel?.ready())return;await new Promise(resolve=>setTimeout(resolve,50));}throw new Error('Le jeu ne parvient pas à démarrer. Rechargez la page.');}
function newId() {const values=new Uint32Array(4);crypto.getRandomValues(values);return Array.from(values,v=>v.toString(16).padStart(8,'0')).join('');}
function signedOut() {
  session=null;visited=null;window.MonsterHotel.logout();bar.hidden=true;document.body.classList.remove('online');auth();
}
function toolbar() {
  if(!bar.hidden){bar.querySelector('#game-status').textContent='';return;}
  bar.replaceChildren();bar.hidden=false;document.body.classList.add('online');
  text('span',`${session.player.name} · #${session.player.id}`,bar);
  const actions=text('div','',bar);actions.className='bar-actions';
  button('Amis',friends,actions);button('Cadeaux',gifts,actions);
  button('Mon hôtel',()=>loadOwn(),actions);button('Synchroniser',()=>loadOwn(),actions);
  button('Déconnexion',async()=>{if(!window.MonsterHotel.beginNavigation())throw new Error('Attendez la fin de l’action.');try{try{await api('/api/auth/logout','POST',{});}catch(error){if(error.status!==401)throw error;}signedOut();}finally{window.MonsterHotel.endNavigation();}},actions);
  const status=text('span','',bar);status.id='game-status';status.setAttribute('aria-live','polite');
  window.dispatchEvent(new Event('resize'));
}
async function recoverPending() {
  const key=`mh.pending.${session.player.id}`, raw=sessionStorage.getItem(key);
  if(raw){let value;try{value=JSON.parse(raw);}catch{sessionStorage.removeItem(key);throw new Error('La commande locale est illisible.');}
    try{await api('/api/commands','POST',value);sessionStorage.removeItem(key);}catch(error){if(error.status>=400&&error.status<500&&error.status!==401){sessionStorage.removeItem(key);}else throw error;}}
  const social=sessionStorage.getItem(socialKey());if(social)await sendSocial(JSON.parse(social));
}
async function loadOwn(initial=false) {
  if(syncing)return;
  await ready();
  if(!window.MonsterHotel.beginNavigation())throw new Error('Attendez la fin de l’action avant de synchroniser.');
  syncing=true;
  try{await recoverPending();const snapshot=await api('/api/hotel');await ready();visited=null;
    if(initial)window.MonsterHotel.connect(session,snapshot);else window.MonsterHotel.own(snapshot);
    toolbar();dialog.close();
  }finally{syncing=false;window.MonsterHotel.endNavigation();}
}
function auth() {
  reset('Bienvenue à Monster Hotel');
  text('p','Votre hôtel est sauvegardé sur le serveur. Connectez-vous ou créez votre compte MonsterHotel.',content);
  const form=document.createElement('form');content.append(form);
  const nameLabel=text('label','Nom du compte',form), name=document.createElement('input');name.name='name';name.autocomplete='username';name.required=true;name.minLength=3;name.maxLength=32;name.pattern='[A-Za-z0-9_]+';nameLabel.append(name);
  const passLabel=text('label','Mot de passe',form), pass=document.createElement('input');pass.name='password';pass.type='password';pass.autocomplete='current-password';pass.minLength=10;pass.maxLength=128;pass.required=true;passLabel.append(pass);
  const actions=document.createElement('div');actions.className='actions';form.append(actions);
  const submit=text('button','Se connecter',actions);submit.type='submit';
  async function enter(route) {if(!form.reportValidity())return;submit.disabled=true;try{session=await api(route,'POST',{name:name.value,password:pass.value});pass.value='';await loadOwn(true);}finally{submit.disabled=false;}}
  form.addEventListener('submit',event=>{event.preventDefault();enter('/api/auth/login').catch(showError);});
  button('Créer un compte',()=>enter('/api/auth/register'),actions);
  text('p','Ces comptes appartiennent à MonsterHotel. La liaison avec Eternaltwin sera disponible lorsque son intégration sera configurée.',content);
  const demo=text('a','Essayer la démo locale',content);demo.href='?offline=1';
  const message=text('p','',content);message.className='message';message.setAttribute('role','alert');name.focus();
}
async function friends() {
  reset('Vos amis');const data=await api('/api/friends');
  text('p',`Votre identifiant : ${session.player.id}. Les demandes doivent être acceptées avant une visite ou un cadeau.`,content);
  const form=document.createElement('form');content.append(form);
  const label=text('label','Identifiant du compte à ajouter',form), input=document.createElement('input');input.name='playerId';input.required=true;input.inputMode='numeric';input.pattern='[1-9][0-9]*';label.append(input);
  const send=text('button','Envoyer une demande',form);send.type='submit';form.addEventListener('submit',async event=>{event.preventDefault();send.disabled=true;try{await api('/api/friends/request','POST',{playerId:input.value});await friends();text('p','Demande envoyée.',content);}catch(error){showError(error);}finally{send.disabled=false;}});
  text('h2','Demandes reçues',content);
  for(const person of data.requests){const row=text('div','',content);row.className='entry';text('strong',`${person.name} · #${person.id}`,row);button('Accepter',async()=>{await api('/api/friends/accept','POST',{playerId:String(person.id)});await friends();},row);}
  if(!data.requests.length)text('p','Aucune demande en attente.',content);
  text('h2','Hôtels de vos amis',content);
  for(const person of data.friends){const row=text('div','',content);row.className='entry';text('strong',`${person.name} · #${person.id}`,row);
    button('Visiter',async()=>{if(!window.MonsterHotel.beginNavigation())throw new Error('Attendez la fin de l’action.');try{const snapshot=await api(`/api/friends/${person.id}/hotel`);visited=String(person.id);window.MonsterHotel.visit(snapshot);dialog.close();const status=document.querySelector('#game-status');if(status)status.textContent=`Visite : ${person.name} (lecture seule)`;}finally{window.MonsterHotel.endNavigation();}},row);
    button('Offrir',()=>giftForm(person),row);
    button('Recevoir de l’amour',async()=>{const value=await mutate(`/api/friends/${person.id}/love`,{requestId:newId()});await loadOwn();if(!value.ok)throw new Error(messages[value.error]||'Impossible de récupérer cet amour.');reset('Amour reçu');text('p',`Votre hôtel a reçu ${value.amount} amour.`,content);closeButton();},row);
  }
  if(!data.friends.length)text('p','Votre liste est vide : ajoutez un compte et faites accepter la demande.',content);
  closeButton();
}
function giftForm(person) {
  reset(`Offrir à ${person.name}`);text('p','Le cadeau est débité une seule fois, puis votre ami le reçoit dans sa boîte de cadeaux.',content);
  const form=document.createElement('form');content.append(form);
  const label=text('label','Quantité (1 à 1000)',form), amount=document.createElement('input');amount.type='number';amount.name='amount';amount.min='1';amount.max='1000';amount.step='1';amount.value='1';label.append(amount);
  const actions=text('div','',form);actions.className='actions';const requestId=newId();
  for(const [kind,name] of [['gold','Or'],['gem','Gemme'],['love','Amour']])button(name,async()=>{
    if(!form.reportValidity())return;await mutate('/api/gifts',{requestId,toPlayerId:String(person.id),kind,amount:amount.valueAsNumber});await loadOwn();reset('Cadeau envoyé');text('p','Votre ami peut maintenant recevoir son cadeau.',content);closeButton();
  },actions);
  closeButton();
}
async function gifts() {
  reset('Vos cadeaux');const data=await api('/api/gifts');
  for(const gift of data.gifts){const row=text('div','',content);row.className='entry';const mine=String(gift.recipient)===String(session.player.id);
    text('strong',`${gift.amount} ${({gold:'or',gem:'gemme(s)',love:'amour'})[gift.kind]} · ${mine?'reçu de #'+gift.sender:'envoyé à #'+gift.recipient}`,row);
    if(mine&&!gift.claimed){const requestId=newId();button('Recevoir',async()=>{await mutate(`/api/gifts/${gift.id}/claim`,{requestId});await loadOwn();await gifts();},row);}else text('span',gift.claimed?'Reçu':'En attente',row);
  }
  if(!data.gifts.length)text('p','Aucun cadeau pour le moment.',content);closeButton();
}
dialog.addEventListener('cancel',event=>{if(!session&&!offline)event.preventDefault();});
window.addEventListener('monsterhotel:authentication-required',()=>{if(session)signedOut();});
window.addEventListener('monsterhotel:social',event=>{if(!session)return;((event.detail==='gifts')?gifts():friends()).catch(showError);});
window.addEventListener('online',()=>{const status=document.querySelector('#game-status');if(status)status.textContent='Connexion rétablie · Synchroniser pour reprendre.';});
window.addEventListener('offline',()=>{const status=document.querySelector('#game-status');if(status)status.textContent='Hors connexion · Votre hôtel reste sauvegardé sur le serveur.';});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&session){const status=document.querySelector('#game-status');if(status)status.textContent='Utilisez Synchroniser pour actualiser votre hôtel.';}});
if(!offline){auth();try{session=await api('/api/session');await loadOwn(true);}catch(error){if(error.status!==401)showError(error);}}
