(() => {
 const form=document.getElementById('request'), email=document.getElementById('email'), confirm=document.getElementById('confirm'), status=document.getElementById('status'), send=form.querySelector('button');
 let token=new URLSearchParams(location.hash.slice(1)).get('token');
 history.replaceState(null,'',location.pathname);
 async function post(path,body){return fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'same-origin',cache:'no-store',redirect:'error'});}
 if(token){
  form.hidden=true;
  if(!/^[a-f0-9]{64}$/.test(token)){status.textContent='Invalid sign-in link.';return;}
  confirm.hidden=false;confirm.disabled=false;
  confirm.addEventListener('click',async()=>{
   confirm.disabled=true;
   try{const r=await post('/api/customer/login/confirm',{token});if(r.ok){token=null;status.textContent='Signed in.';location.assign('/customer-portal');return;}status.textContent='Sign-in could not be confirmed. Request a new link.';}catch{status.textContent='Connection interrupted. Request a new link if needed.';}confirm.disabled=false;
  });
 }else{
  send.disabled=false;
  form.addEventListener('submit',async e=>{e.preventDefault();send.disabled=true;try{const r=await post('/api/customer/login/request',{email:email.value.trim()});status.textContent=r.ok?'If your account is eligible, a sign-in link will be sent.':'Sign-in temporarily unavailable. Try again later.';}catch{status.textContent='Connection interrupted. Try again later.';}finally{send.disabled=false;}});
 }
})();