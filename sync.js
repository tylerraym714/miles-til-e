var FB=window.FB_BASE||"https://miles-til-e-default-rtdb.firebaseio.com";
function fbx(m,path,body){var c=new AbortController(),t=setTimeout(function(){c.abort()},8000);return fetch(FB+path+".json"+(m==="GET"?"":"?print=silent"),{method:m,body:body===undefined?undefined:JSON.stringify(body),signal:c.signal}).then(function(r){clearTimeout(t);if(!r.ok)throw new Error("http "+r.status);return m==="GET"?r.json():null},function(e){clearTimeout(t);throw e})}
function genCode(){var a="abcdefghjkmnpqrstuvwxyz23456789",b=new Uint8Array(16),s="";crypto.getRandomValues(b);for(var i=0;i<16;i++)s+=a[b[i]%a.length];return s}
function fmtCode(c){return c.match(/.{1,4}/g).join("-")}
function normCode(c){return String(c||"").toLowerCase().replace(/[^a-z0-9]/g,"")}
function newId(){return "e"+Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
function metaOf(v){return {name:v.name,tank:v.tank,cushion:v.cushion,mpg:v.mpg,t:v.metaT||Date.now(),note:{text:v.note||"",t:v.noteT||0}}}
function noteFromMeta(m){if(!m)return {text:"",t:0};var n=m.note;if(n&&typeof n==="object")return {text:String(n.text||""),t:n.t||0};if(typeof n==="string")return {text:n,t:m.noteT||0};return {text:"",t:0}}
function applyNote(v,m){var r=noteFromMeta(m),lt=v.noteT||0;if(r.t>lt){v.note=r.text;v.noteT=r.t;return true}return false}
function noteAhead(v,m){return (v.noteT||0)>(noteFromMeta(m).t||0)}
function pushNote(v){if(!v||!v.shared)return;fbx("PUT","/shared/"+v.shared+"/meta/note",{text:v.note||"",t:v.noteT||Date.now()}).catch(function(){})}
function showNote(){var el=$("vnote");if(!el||document.activeElement===el)return;el.value=S.note||""}
function noteTyping(){var el=$("vnote");return el&&document.activeElement===el}
function commitNote(){var el=$("vnote");if(!el)return;var val=el.value;if(val===(S.note||""))return;S.note=val;S.noteT=Date.now();save();if(S.shared)pushNote(S)}
function pushMeta(v){v.metaT=Date.now();save();fbx("PATCH","/shared/"+v.shared+"/meta",{name:v.name,tank:v.tank,cushion:v.cushion,mpg:v.mpg,t:v.metaT}).catch(function(){})}
function rebuild(v){
 v.log.sort(function(a,b){return (a.odo||0)-(b.odo||0)||(a.t||0)-(b.t||0)});
 var prev=null,aft=0;
 v.log.forEach(function(e){var mi=(prev&&e.odo&&prev.odo)?e.odo-prev.odo:0;var b=prev?Math.max(0,aft-mi/v.mpg):0;aft=Math.round(Math.min(v.tank,typeof e.a==="number"?e.a:(e.full?v.tank:b+e.gal))*10)/10;e.after=aft;prev=e})}
function shareUI(){var s=!!S.shared;$("sync").textContent=s?(S.syncMsg||"Shared · syncing…"):"";$("code").textContent=s?"Share code: "+fmtCode(S.shared):"";$("sharev").hidden=s;$("sendv").hidden=!s;$("unsharev").hidden=!s}
function uiSync(prev){vsel();var c=$("cur"),L=last();if(L&&(c.value===""||c.value===String(prev)))c.value=L.odo;hist();draw();showNote();var a=document.activeElement;if(!a||(a.tagName!=="INPUT"&&a.tagName!=="TEXTAREA"))settings();else shareUI()}
function sync(v){
 if(!v||!v.shared||v.busy)return Promise.resolve();
 v.busy=true;
 var base="/shared/"+v.shared,prev=(v===S&&last())?last().odo:null;
 return fbx("GET",base).then(function(r){
  r=r||{};var re=r.entries||{};v.dead=v.dead||{};
  Object.keys(re).forEach(function(id){var e=re[id];if(!e)return;
   if(e.del){v.dead[id]=1;v.log=v.log.filter(function(x){return x.id!==id})}
   else if(!v.dead[id]&&!v.log.some(function(x){return x.id===id})){e.id=id;v.log.push(e)}});
  var jobs=[];
  v.log.forEach(function(e){if(!re[e.id])jobs.push(fbx("PUT",base+"/entries/"+e.id,{d:e.d,odo:e.odo||null,gal:e.gal,full:!!e.full,t:e.t||0,a:e.a,park:e.park||undefined}))});
  Object.keys(v.dead).forEach(function(id){if(!re[id]||!re[id].del)jobs.push(fbx("PUT",base+"/entries/"+id,{del:true,t:Date.now()}))});
  if(r.meta){if((r.meta.t||0)>(v.metaT||0)){v.name=r.meta.name||v.name;v.tank=r.meta.tank||v.tank;v.cushion=r.meta.cushion||v.cushion;v.mpg=r.meta.mpg||v.mpg;v.metaT=r.meta.t}
   if(!(v===S&&noteTyping())&&applyNote(v,r.meta)){}
   else if(noteAhead(v,r.meta))jobs.push(fbx("PUT",base+"/meta/note",{text:v.note||"",t:v.noteT||Date.now()}))}
  else jobs.push(fbx("PUT",base+"/meta",metaOf(v)));
  rebuild(v);calib(v);
  v.syncMsg="Shared · synced "+new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
  return Promise.all(jobs)
 }).catch(function(){v.syncMsg="Shared · can’t reach the online log. Showing this phone’s copy."}).then(function(){v.busy=false;save();if(v===S)uiSync(prev)})}
function sendCode(v){var t="Join my vehicle “"+v.name+"” in Miles til E. Tap Join and enter this code: "+fmtCode(v.shared);if(navigator.share){navigator.share({text:t}).catch(function(){})}else{prompt("Copy this code and send it:",fmtCode(v.shared))}}
function wireSync(){
 var noteTimer=null;
 $("vnote").addEventListener("input",function(){clearTimeout(noteTimer);noteTimer=setTimeout(function(){noteTimer=null;commitNote()},1000)});
 $("vnote").addEventListener("blur",function(){clearTimeout(noteTimer);noteTimer=null;commitNote()});
 $("park").onclick=function(){var o=parseFloat($("cur").value),m=$("pmsg"),L=last();
  if(isNaN(o)){m.textContent="Type your odometer reading first.";return}
  if(L&&o<L.odo){m.textContent="That’s lower than your last entry ("+L.odo+").";return}
  if(L&&o===L.odo){m.textContent="No new miles since your last entry.";return}
  var after=r1(est(o));
  if(L&&L.park){var x=S.log.pop();if(S.shared&&x.id)S.dead[x.id]=1}
  S.log.push({id:newId(),t:Date.now(),park:true,d:today(),odo:o,gal:0,after:after});
  if(S.shared){rebuild(S);var vv=S;setTimeout(function(){sync(vv)},0)}
  calib(S);save();hist();draw();m.textContent="Saved. About "+r1(est(o))+" gallons left at "+o+"."};
 $("sharev").onclick=function(){var v=S;if(!confirm("Share this vehicle? Anyone with the code can see and add to its log."))return;
  v.shared=genCode();v.dead={};v.metaT=Date.now();v.log.forEach(function(e){if(!e.id)e.id=newId();if(!e.t)e.t=0});var top=v.log.slice().sort(function(a,b){return (b.odo||0)-(a.odo||0)})[0];if(top&&typeof top.after==="number"&&isFinite(top.after))top.a=top.after;rebuild(v);save();shareUI();
  fbx("PUT","/shared/"+v.shared+"/meta",metaOf(v)).then(function(){return sync(v)}).then(function(){sendCode(v)}).catch(function(){v.shared=null;save();shareUI();alert("Couldn’t reach the online database. Try again with a connection.")})};
 $("sendv").onclick=function(){sendCode(S)};
 $("unsharev").onclick=function(){if(confirm("Stop syncing on this phone? Your copy stays here, and the shared log stays online for others.")){S.shared=null;S.dead={};save();refresh()}};
 $("joinv").onclick=function(){var c=normCode(prompt("Enter the share code"));if(!c)return;
  if(c.length<12){alert("That code looks too short.");return}
  var ex=DB.v.filter(function(x){return x.shared===c})[0];if(ex){DB.a=ex.id;pick();save();refresh();return}
  fbx("GET","/shared/"+c+"/meta").then(function(m){if(!m){alert("No vehicle found for that code. Check it and try again.");return}
   var v=mk(m.name||"Shared vehicle");v.mpg=m.mpg||v.mpg;v.tank=m.tank||v.tank;v.cushion=m.cushion||v.cushion;v.shared=c;v.dead={};v.metaT=m.t||0;applyNote(v,m);DB.v.push(v);DB.a=v.id;pick();save();refresh();return sync(v)}).catch(function(){alert("Couldn’t reach the online database. Check your connection.")})};
 $("auto").onchange=function(){S.auto=this.checked;if(S.auto){S.calKey=null;calib(S)}save();settings();draw()};
 setInterval(function(){if(!document.hidden&&S&&S.shared)sync(S)},20000);
 document.addEventListener("visibilitychange",function(){if(!document.hidden&&S&&S.shared)sync(S)});
 window.addEventListener("online",function(){if(S&&S.shared)sync(S)})}
