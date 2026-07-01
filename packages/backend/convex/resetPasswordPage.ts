export function resetPasswordPage(): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Passwort zuruecksetzen - Z</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif; background:#fff; color:#000; display:flex; align-items:center; justify-content:center; min-height:100vh; padding:24px; }
.card { width:100%; max-width:360px; text-align:center; }
.logo { font-size:56px; font-weight:900; letter-spacing:-2px; margin-bottom:24px; }
h1 { font-size:22px; font-weight:700; margin-bottom:20px; }
input { width:100%; padding:14px 16px; font-size:16px; border:1px solid #ddd; border-radius:12px; margin-bottom:12px; }
button { width:100%; padding:14px; font-size:16px; font-weight:600; color:#fff; background:#000; border:none; border-radius:50px; }
button:disabled { opacity:.5; }
.msg { margin-top:16px; font-size:14px; line-height:1.5; }
.err { color:#c00; }
.ok { color:#0a0; }
.hint { margin-top:8px; font-size:13px; color:#999; }
</style>
</head>
<body>
<div class="card">
<div class="logo">Z</div>
<h1>Neues Passwort setzen</h1>
<div id="form">
<input id="pw" type="password" placeholder="Neues Passwort (min. 8 Zeichen)" autocomplete="new-password" />
<input id="pw2" type="password" placeholder="Passwort wiederholen" autocomplete="new-password" />
<button id="btn" onclick="submitReset()">Passwort speichern</button>
<div class="hint">Danach in der Z-App mit dem neuen Passwort anmelden.</div>
</div>
<div id="msg" class="msg"></div>
</div>
<script>
function qs(n){return new URLSearchParams(location.search).get(n);}
var token = qs('token');
var msg = document.getElementById('msg');
if(!token){ document.getElementById('form').style.display='none'; msg.className='msg err'; msg.textContent='Ungueltiger oder fehlender Link. Bitte fordere den Reset erneut in der App an.'; }
function postReset(path){ return fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({newPassword:document.getElementById('pw').value, token:token})}); }
async function submitReset(){
  var pw=document.getElementById('pw').value, pw2=document.getElementById('pw2').value;
  msg.className='msg';
  if(pw.length<8){ msg.className='msg err'; msg.textContent='Passwort muss mindestens 8 Zeichen haben.'; return; }
  if(pw!==pw2){ msg.className='msg err'; msg.textContent='Die Passwoerter stimmen nicht ueberein.'; return; }
  var btn=document.getElementById('btn'); btn.disabled=true; btn.textContent='Speichern...';
  try{
    var res=await postReset('/api/auth/reset-password');
    if(res.status===404){ res=await postReset('/reset-password'); }
    if(res.ok){
      document.getElementById('form').style.display='none';
      msg.className='msg ok'; msg.textContent='Passwort geaendert! Du kannst die Z-App jetzt oeffnen und dich mit deinem neuen Passwort anmelden.';
    } else {
      var t=''; try{ t=(await res.json()).message||''; }catch(e){}
      msg.className='msg err'; msg.textContent='Fehler: '+(t||('Der Link ist evtl. abgelaufen ('+res.status+'). Bitte fordere einen neuen an.'));
      btn.disabled=false; btn.textContent='Passwort speichern';
    }
  }catch(e){
    msg.className='msg err'; msg.textContent='Netzwerkfehler. Bitte erneut versuchen.';
    btn.disabled=false; btn.textContent='Passwort speichern';
  }
}
</script>
</body>
</html>`;
}
