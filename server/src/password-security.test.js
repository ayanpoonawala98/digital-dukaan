import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
process.env.DATABASE_URL ||= 'postgres://local:local@localhost:5432/test';
process.env.JWT_SECRET ||= 'test-secret-must-be-at-least-32-characters-long';
const { passwordStamp,validPasswordSession,validatePasswordChange }=await import('./password-security.js');
test('password validation rejects mismatches, reuse, short and truncated unicode',()=>{const base={currentPassword:'oldpasswordlong',newPassword:'newpasswordlong',confirmPassword:'newpasswordlong'};assert.equal(validatePasswordChange(base),null);for(const patch of [{currentPassword:''},{newPassword:'short'},{confirmPassword:'mismatch'},{newPassword:'oldpasswordlong',confirmPassword:'oldpasswordlong'},{newPassword:'🙂'.repeat(25),confirmPassword:'🙂'.repeat(25)}])assert.ok(validatePasswordChange({...base,...patch}));});
test('password sessions preserve legacy sign-ins until a change and revoke old stamped sessions',()=>{assert.equal(validPasswordSession({},{}),true);assert.equal(validPasswordSession({},{passwordChangedAt:new Date()}),false);assert.equal(validPasswordSession({pwd:passwordStamp('hash')},{passwordHash:'hash'}),true);assert.equal(validPasswordSession({pwd:passwordStamp('old')},{passwordHash:'new'}),false);});
test('route checks old password, updates only authenticated user, hashes password, invalidates old login and allows new login',async()=>{
 const {default:app}=await import('./app.js'),{User}=await import('./models/index.js');
 const original=[User.unscoped,User.update,User.findByPk];let u={id:7,active:true,role:'owner',email:'qa@example.invalid',name:'QA',passwordHash:await bcrypt.hash('oldpasswordlong',4)};
 User.findByPk=async id=>Number(id)===7?u:null;
 User.unscoped=()=>({findByPk:async id=>Number(id)===7?u:null,findOne:async()=>u});let changes=0;
 User.update=async(values,{where})=>{assert.equal(where.id,7);assert.equal(where.passwordHash,u.passwordHash);u={...u,...values};changes++;return[1];};
 const server=app.listen(0),base=`http://127.0.0.1:${server.address().port}/api/auth`,old=jwt.sign({sub:7},process.env.JWT_SECRET);
 const post=(path,body,token)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
 try{const body={currentPassword:'oldpasswordlong',newPassword:'newpasswordlong',confirmPassword:'newpasswordlong'};assert.equal((await post('/change-password',body)).status,401);assert.equal((await post('/change-password',{...body,currentPassword:'wrong'},old)).status,400);assert.equal(changes,0);const r=await post('/change-password',{...body,id:99},old);assert.equal(r.status,200);assert.deepEqual(await r.json(),{changed:true});assert.equal(changes,1);assert.equal(await bcrypt.compare(body.newPassword,u.passwordHash),true);assert.equal((await fetch(base+'/me',{headers:{Authorization:`Bearer ${old}`}})).status,401);assert.equal((await post('/login',{email:u.email,password:body.currentPassword})).status,401);const login=await post('/login',{email:u.email,password:body.newPassword});assert.equal(login.status,200);const j=await login.json();assert.equal(j.user.passwordHash,undefined);assert.equal((await fetch(base+'/me',{headers:{Authorization:`Bearer ${j.token}`}})).status,200);}
 finally{[User.unscoped,User.update,User.findByPk]=original;await new Promise(r=>server.close(r));}
});
test('superadmin reset requires role, reauthentication and exact owner confirmation',async()=>{
 const {default:app}=await import('./app.js'),{User}=await import('./models/index.js');const original=[User.findByPk,User.unscoped];let changed=0;
 const admin={id:1,role:'superadmin',active:true,passwordHash:await bcrypt.hash('superadminsecret',4)},owner={id:7,role:'owner',email:'owner@example.invalid',passwordHash:await bcrypt.hash('oldownerpassword',4),update:async values=>{changed++;assert.ok(values.passwordChangedAt);assert.equal(await bcrypt.compare('newownerpassword',values.passwordHash),true);}};
 User.findByPk=async id=>Number(id)===1?admin:{id:7,role:'owner',active:true};User.unscoped=()=>({findByPk:async id=>Number(id)===1?admin:Number(id)===7?owner:null});const server=app.listen(0),base=`http://127.0.0.1:${server.address().port}/api/admin/users/7/password`,token=id=>jwt.sign({sub:id},process.env.JWT_SECRET);const body={currentPassword:'superadminsecret',ownerEmail:owner.email,newPassword:'newownerpassword',confirmPassword:'newownerpassword'};const post=(id,patch={})=>fetch(base,{method:'POST',headers:{Authorization:`Bearer ${token(id)}`,'Content-Type':'application/json'},body:JSON.stringify({...body,...patch})});
 try{assert.equal((await post(7)).status,403);assert.equal((await post(1,{currentPassword:'wrong'})).status,400);assert.equal((await post(1,{ownerEmail:'other@example.invalid'})).status,400);assert.equal(changed,0);const r=await post(1);assert.equal(r.status,200);assert.equal(changed,1);assert.equal((await r.json()).owner.email,owner.email);}finally{[User.findByPk,User.unscoped]=original;await new Promise(r=>server.close(r));}
});
