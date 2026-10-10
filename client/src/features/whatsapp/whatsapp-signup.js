let sdk;
export function loadMetaSdk(config) {
  if (!sdk) sdk=new Promise((resolve,reject)=>{
    const init=()=>{window.FB.init({appId:config.appId,version:config.version,autoLogAppEvents:false,xfbml:false});resolve(window.FB);};
    if(window.FB)return init();
    window.fbAsyncInit=init;
    const script=document.createElement('script');script.src='https://connect.facebook.net/en_US/sdk.js';script.async=true;script.defer=true;
    script.onerror=()=>{sdk=null;reject(new Error('Meta login could not load. Check your browser or connection.'));};
    document.head.appendChild(script);
  });
  return sdk;
}
export function trustedMetaOrigin(origin) {
  try {const url=new URL(origin);return url.protocol==='https:' && ['www.facebook.com','web.facebook.com','business.facebook.com','facebook.com'].includes(url.hostname);}catch{return false;}
}
// Exchange a short-lived code immediately. Session asset IDs may arrive before or
// after it, so only final registration waits for both independent responses.
export function runEmbeddedSignup(FB,config,{exchange,complete,onError,onSuccess}) {
  let stopped=false,assets,authorized=false,completing=false;
  const cleanup=()=>{stopped=true;window.removeEventListener('message',listener);clearTimeout(timeout);};
  const fail=error=>{if(stopped)return;cleanup();onError(error instanceof Error?error:new Error(String(error)));};
  async function finish(){
    if(stopped||!assets||!authorized||completing)return;completing=true;
    try {const result=await complete(assets);if(stopped)return;cleanup();onSuccess(result);}catch(e){fail(e);}
  }
  function listener(event){
    if(stopped||!trustedMetaOrigin(event.origin))return;
    let data;try {data=typeof event.data==='string'?JSON.parse(event.data):event.data;}catch{return;}
    if(data?.type!=='WA_EMBEDDED_SIGNUP')return;
    if(data.event==='FINISH' && /^\d{1,40}$/.test(String(data.data?.waba_id||'')) && /^\d{1,40}$/.test(String(data.data?.phone_number_id||''))){assets={wabaId:String(data.data.waba_id),phoneNumberId:String(data.data.phone_number_id)};finish();}
    else if(data.event==='CANCEL')fail(new Error('WhatsApp connection was cancelled. Nothing will be sent.'));
    else if(data.event==='ERROR')fail(new Error('Meta could not finish signup. Check your business account in Meta and try again.'));
  }
  const timeout=setTimeout(()=>fail(new Error('WhatsApp connection timed out. Refresh the connection status before starting again.')),180000);
  window.addEventListener('message',listener);
  try {FB.login(async response=>{
    if(stopped)return;
    if(!response?.authResponse?.code)return fail(new Error('Meta did not authorize the connection. Try again when ready.'));
    try {await exchange(response.authResponse.code);if(stopped)return;authorized=true;finish();}catch(e){fail(e);}
  },{config_id:config.configId,response_type:'code',override_default_response_type:true,extras:{setup:{}}});}catch(e){fail(e);}
  return cleanup;
}
