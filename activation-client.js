(() => {
 const button=document.getElementById('confirm'), result=document.getElementById('result');
 let token=new URLSearchParams(location.hash.slice(1)).get('token');
 history.replaceState(null,'',location.pathname);
 if(!token||! /^[a-f0-9]{64}$/.test(token)){result.textContent='Invalid invitation. Request a new link from support.';return;}
 button.disabled=false;
 button.addEventListener('click',async()=>{
  button.disabled=true;
  try{
   const response=await fetch('/api/activate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token}),cache:'no-store',credentials:'omit',redirect:'error'});
   if(response.ok){token=null;result.textContent='Account activated. Customer sign-in will be available separately.';}
   else {result.textContent='Activation could not be confirmed. Contact support for assistance.';button.disabled=false;}
  }catch{result.textContent='Connection interrupted. Contact support if activation cannot be confirmed.';button.disabled=false;}
 });
})();