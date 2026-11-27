(() => {
 const el=id=>document.getElementById(id), status=el('status'), panel=el('account'), signin=el('signin'), logout=el('logout');
 let generation=0;
 function clear(){panel.hidden=true;for(const id of ['business','email','plan','state','activated'])el(id).textContent='';}
 async function load(){
  const current=++generation;clear();signin.hidden=true;status.textContent='Verifying your session…';
  try{
   const r=await fetch('/api/customer/account',{credentials:'same-origin',cache:'no-store',redirect:'error'});
   if(current!==generation)return;
   if(r.status===401){status.textContent='Sign-in required.';signin.hidden=false;return;}
   if(!r.ok)throw Error('Unavailable');
   const {account}=await r.json();if(current!==generation)return;
   if(!account||account.status!=='active')throw Error('Unavailable');
   for(const [id,key] of Object.entries({business:'businessName',email:'email',plan:'plan',state:'status',activated:'activatedAt'}))el(id).textContent=String(account[key]??'Not available');
   status.textContent='Your private pilot account';panel.hidden=false;
  }catch{if(current===generation){clear();status.textContent='Account temporarily unavailable.';signin.hidden=false;}}
 }
 logout.addEventListener('click',async()=>{
  ++generation;clear();status.textContent='Signing out…';
  try{const r=await fetch('/api/customer/logout',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error'});status.textContent=r.ok?'Signed out.':'Server-side sign-out could not be confirmed.';}
  catch{status.textContent='Sign-out could not be confirmed. Reconnect and try again.';}
  signin.hidden=false;
 });
 addEventListener('pagehide',()=>{++generation;clear();});
 addEventListener('pageshow',load);
})();