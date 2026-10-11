import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const auth=process.env.QA_STORAGE_STATE;
const validAuth=Boolean(auth&&fs.existsSync(auth));
test.use({storageState:validAuth?auth:undefined});
test.describe('QA owner regression (private storage state required)',()=>{
 test.skip(!validAuth,'Set QA_STORAGE_STATE to a private QA-owner browser state file; no credentials embedded');
 const stores=[8,12,13];
 const sections=['Overview','Products','Categories','Customers','Reviews','Sales','Coupons','Staff','Notifications','Email & SMS offers','WhatsApp broadcast','WhatsApp integration','Shop settings'];
 for(const id of stores) test(`store ${id}: every applicable owner section loads`,async({page},info)=>{
  await page.goto('/dashboard');await expect(page.locator('.store-switcher')).toBeVisible();
  await page.locator('.store-switcher').selectOption(String(id));
  await expect(page.locator('.store-switcher')).toHaveValue(String(id));
  for(const section of [...sections,...(id===12?['Tables','Kitchen']:[id===13?'Bookings':'Orders'])]){
   await page.locator('.sidebar nav').getByRole('button',{name:section,exact:true}).click();
   await expect(page.locator('.admin-content .dashboard-panel, .admin-content form').first()).toBeVisible();
   await expect(page.locator('.load-skeleton, .admin-content .brand-loader')).toHaveCount(0);
   await expect(page.locator('.admin-content')).not.toContainText('Something went wrong');
   await expect(page.locator('.admin-content')).not.toContainText('Kindly contact admin');
   await expect(page.locator('.store-switcher')).toHaveValue(String(id));
   const path=info.outputPath(`store-${id}-${section.replace(/\W/g,'-')}.png`);
   await page.screenshot({path,fullPage:true,animations:'disabled'});
   await info.attach(section,{path,contentType:'image/png'});
  }
 });
 test('store 12: controlled product CRUD with cleanup',async({page})=>{
  test.skip(process.env.QA_ALLOW_WRITES!=='1','Explicit opt-in for isolated QA writes required');
  const name=`QA test automation ${Date.now()}`;
  await page.goto('/dashboard');await expect(page.locator('.store-switcher')).toBeVisible();
  await page.locator('.store-switcher').selectOption('12');
  await page.locator('.sidebar nav').getByRole('button',{name:'Products',exact:true}).click();
  await expect(page.locator('.admin-content .dashboard-panel, .admin-content form').first()).toBeVisible();
   await expect(page.locator('.load-skeleton, .admin-content .brand-loader')).toHaveCount(0);
  await expect(page.locator('.store-switcher')).toHaveValue('12');
  await expect(page.locator('.store-switcher option:checked')).toHaveText(/qa/i);
  await page.getByRole('button',{name:'Add product',exact:true}).click();
  await page.getByRole('textbox',{name:'Product name',exact:true}).fill(name);
  await page.getByRole('spinbutton',{name:'Price (₹)',exact:true}).fill('101');
  await page.getByRole('button',{name:'Save product',exact:true}).click();
  const row=page.getByRole('row').filter({hasText:name});
  try{
   await expect(row).toBeVisible();await expect(row).toContainText('₹101');
   await row.getByRole('button',{name:'Edit',exact:true}).click();
   await page.getByRole('spinbutton',{name:'Price (₹)',exact:true}).fill('102');
   await page.getByRole('button',{name:'Save product',exact:true}).click();
   await expect(row).toContainText('₹102');
  }finally{
   if(await row.count()){
    await expect(page.locator('.store-switcher')).toHaveValue('12');
    await expect(page.locator('.store-switcher option:checked')).toHaveText(/qa/i);
    await row.getByRole('button',{name:'Delete',exact:true}).click();
    await row.getByRole('button',{name:'Yes, delete',exact:true}).click();
    await expect(row).toHaveCount(0);
   }
  }
 });
});

test.describe('QA owner multilingual dry-run imports',()=>{
 test.skip(!validAuth,'Private QA-owner storage state required');
 for(const kind of ['products','customers']) for(const language of ['en','hi','mr']) test(`${kind} ${language}: mapped import preview uses stable API route`,async({page})=>{
  await page.goto('/dashboard');await expect(page.locator('.store-switcher')).toBeVisible();
  await page.locator('.store-switcher').selectOption('8');
  await expect(page.locator('.store-switcher')).toHaveValue('8');
  await expect(page.locator('.store-switcher option:checked')).toHaveText(/qa/i);
  await page.locator('.owner-language select').selectOption('en');
  await page.locator('.sidebar nav').getByRole('button',{name:kind==='products'?'Products':'Customers',exact:true}).click();
  await expect(page.locator('.mapped-import')).toBeVisible();
  await page.locator('.owner-language select').selectOption(language);
  const panel=page.locator('.mapped-import');
  const csv=kind==='products'?'name,price,stock\nQA test dry-run only,10,1\n':'phone,name\n919000001124,QA test dry-run only\n';
  await panel.locator('input[type=file]').setInputFiles({name:'qa-dry-run.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
  await expect(panel.locator('.mapping-grid')).toBeVisible();
  const response=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/import/preview'));
  await panel.locator('button.btn-green').first().click();
  const r=await response;expect(r.url()).toContain(`/owner/8/${kind}/import/preview`);expect(r.status()).toBe(200);
  const result=await r.json();expect(result.newCount).toBe(1);expect(result.errors).toHaveLength(0);
  // Never click the commit button. Preview creates no product/customer rows.
 });
});
