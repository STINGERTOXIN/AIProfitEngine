import {processInvitationRecovery} from '../lib/invitation-recovery.mjs';
export default {
 async scheduled(controller,env,ctx){
  ctx.waitUntil((async()=>{
   try{const result=await processInvitationRecovery(env);console.info('APE_INVITATION_RECOVERY',JSON.stringify({processed:result.processed,disabled:!!result.disabled}));}
   catch{console.error('APE_INVITATION_RECOVERY_FAILED');throw Error('Invitation recovery execution failed');}
  })());
 },
 async fetch(){return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});}
};
